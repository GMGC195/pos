const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken, isAdmin } = require('../../middleware/auth');

// Helper to generate unique purchase number (e.g. PUR-20261117-001)
async function generatePurchaseNumber(client) {
  const queryFn = client ? client.query.bind(client) : pool.query.bind(pool);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PUR-${dateStr}-`;

  const res = await queryFn(
    `SELECT purchase_number FROM store_purchases 
     WHERE purchase_number LIKE $1 
     ORDER BY purchase_number DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let seq = 1;
  if (res.rows.length > 0) {
    const lastNum = parseInt(res.rows[0].purchase_number.split('-')[2], 10);
    seq = lastNum + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// -------------------------------------------------------------
// GET /api/store/purchases (List purchases with filters)
// -------------------------------------------------------------
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { store_id, branch, vendor_id, from_date, to_date, payment_status } = req.query;
    let query = `
      SELECT 
        p.*,
        v.name as vendor_name,
        v.phone as vendor_phone,
        sl.name as store_name
      FROM store_purchases p
      JOIN store_vendors v ON p.vendor_id = v.id
      JOIN store_locations sl ON p.store_id = sl.id
      WHERE 1=1
    `;
    const params = [];

    if (store_id && store_id !== 'All') {
      params.push(parseInt(store_id, 10));
      query += ` AND p.store_id = $${params.length}`;
    }

    if (branch && branch !== 'All') {
      params.push(branch);
      query += ` AND p.branch = $${params.length}`;
    }

    if (vendor_id && vendor_id !== 'All') {
      params.push(parseInt(vendor_id, 10));
      query += ` AND p.vendor_id = $${params.length}`;
    }

    if (payment_status && payment_status !== 'All') {
      params.push(payment_status);
      query += ` AND p.payment_status = $${params.length}`;
    }

    if (from_date) {
      params.push(from_date);
      query += ` AND p.invoice_date >= $${params.length}`;
    }

    if (to_date) {
      params.push(to_date);
      query += ` AND p.invoice_date <= $${params.length}`;
    }

    query += ' ORDER BY p.invoice_date DESC, p.id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching purchases:', err);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// -------------------------------------------------------------
// GET /api/store/purchases/:id (Purchase details with line items)
// -------------------------------------------------------------
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const pRes = await pool.query(`
      SELECT 
        p.*,
        v.name as vendor_name,
        v.contact_person,
        v.phone as vendor_phone,
        v.tax_number as vendor_tax_number,
        sl.name as store_name
      FROM store_purchases p
      JOIN store_vendors v ON p.vendor_id = v.id
      JOIN store_locations sl ON p.store_id = sl.id
      WHERE p.id = $1
    `, [id]);

    if (pRes.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase record not found' });
    }

    const itemsRes = await pool.query(`
      SELECT 
        pi.*,
        si.name as item_name,
        si.arabic_name,
        si.item_code,
        sc.name as category_name
      FROM store_purchase_items pi
      JOIN store_items si ON pi.item_id = si.id
      LEFT JOIN store_categories sc ON si.category_id = sc.id
      WHERE pi.purchase_id = $1
      ORDER BY pi.id ASC
    `, [id]);

    res.json({
      purchase: pRes.rows[0],
      items: itemsRes.rows
    });
  } catch (err) {
    console.error('Error fetching purchase details:', err);
    res.status(500).json({ error: 'Failed to fetch purchase details' });
  }
});

// -------------------------------------------------------------
// POST /api/store/purchases (Register Purchase & update Store Stock)
// -------------------------------------------------------------
router.post('/', authenticateToken, async (req, res) => {
  const {
    vendor_id, store_id, branch, invoice_number, invoice_date,
    delivery_date, payment_method, payment_status, notes, items
  } = req.body;

  if (!vendor_id || !store_id || !invoice_date) {
    return res.status(400).json({ error: 'Vendor, store location, and invoice date are required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one line item is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify vendor and store
    const vCheck = await client.query('SELECT name FROM store_vendors WHERE id = $1', [vendor_id]);
    if (vCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vendor not found' });
    }
    const vendorName = vCheck.rows[0].name;

    // Check duplicate invoice number for the same vendor
    if (invoice_number && invoice_number.trim()) {
      const dupCheck = await client.query(
        'SELECT id, purchase_number FROM store_purchases WHERE vendor_id = $1 AND LOWER(TRIM(invoice_number)) = LOWER(TRIM($2))',
        [vendor_id, invoice_number.trim()]
      );
      if (dupCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Invoice number '${invoice_number.trim()}' has already been registered for this vendor under purchase #${dupCheck.rows[0].purchase_number}.`
        });
      }
    }

    const sCheck = await client.query('SELECT branch, name FROM store_locations WHERE id = $1', [store_id]);
    if (sCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Store location not found' });
    }
    const store = sCheck.rows[0];
    const finalBranch = branch || store.branch;
    const userName = req.user?.username || req.user?.name || 'Store Staff';

    // 2. Calculate totals
    let subtotal = 0;
    let totalTax = 0;

    for (const it of items) {
      const qty = parseFloat(it.quantity);
      const price = parseFloat(it.unit_price);
      if (isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
        throw new Error(`Invalid quantity or price for line item.`);
      }
      const lineSub = Math.round(qty * price * 100) / 100;
      const taxRate = parseFloat(it.tax_rate) || 0;
      const lineTax = Math.round((lineSub * taxRate / 100) * 100) / 100;
      subtotal += lineSub;
      totalTax += lineTax;
    }

    const totalAmount = subtotal + totalTax;
    const purchaseNum = await generatePurchaseNumber(client);

    // 3. Create purchase record
    const pIns = await client.query(`
      INSERT INTO store_purchases (
        purchase_number, vendor_id, store_id, branch, invoice_number, invoice_date,
        delivery_date, subtotal, tax_amount, total_amount, payment_method, payment_status,
        status, received_by_user_id, received_by_name, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Received', $13, $14, $15)
      RETURNING *
    `, [
      purchaseNum, vendor_id, store_id, finalBranch, invoice_number?.trim() || null,
      invoice_date, delivery_date || invoice_date, subtotal, totalTax, totalAmount,
      payment_method || 'Cash', payment_status || (payment_method === 'Cash' ? 'Paid' : 'Unpaid'),
      req.user?.id || null, userName, notes || null
    ]);

    const createdPurchase = pIns.rows[0];

    // 4. Insert line items and update store stock
    for (const it of items) {
      const qty = parseFloat(it.quantity);
      const price = parseFloat(it.unit_price);
      const taxRate = parseFloat(it.tax_rate) || 0;
      const lineSub = Math.round(qty * price * 100) / 100;
      const lineTax = Math.round((lineSub * taxRate / 100) * 100) / 100;
      const lineTotal = lineSub + lineTax;

      await client.query(`
        INSERT INTO store_purchase_items (
          purchase_id, item_id, quantity, unit, unit_price, tax_rate, tax_amount,
          total_price, expiry_date, batch_number, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        createdPurchase.id, it.item_id, qty, it.unit || 'KG', price, taxRate, lineTax,
        lineTotal, it.expiry_date || null, it.batch_number || null, it.notes || null
      ]);

      // Atomic inventory increment in store_inventory
      const curInvRes = await client.query(`
        SELECT current_stock FROM store_inventory WHERE store_id = $1 AND item_id = $2 FOR UPDATE
      `, [store_id, it.item_id]);

      let stockBefore = 0;
      if (curInvRes.rows.length === 0) {
        await client.query(`
          INSERT INTO store_inventory (store_id, item_id, current_stock, last_received_stock, updated_at)
          VALUES ($1, $2, $3, $3, NOW())
        `, [store_id, it.item_id, qty]);
        stockBefore = 0;
      } else {
        stockBefore = parseFloat(curInvRes.rows[0].current_stock) || 0;
        await client.query(`
          UPDATE store_inventory
          SET current_stock = current_stock + $1,
              last_received_stock = $1,
              updated_at = NOW()
          WHERE store_id = $2 AND item_id = $3
        `, [qty, store_id, it.item_id]);
      }

      const stockAfter = stockBefore + qty;

      // Update last purchase price on store_items
      await client.query(`
        UPDATE store_items 
        SET last_purchase_price = $1, default_vendor_id = COALESCE(default_vendor_id, $2), updated_at = NOW()
        WHERE id = $3
      `, [price, vendor_id, it.item_id]);

      // Update or link store_vendor_items
      await client.query(`
        INSERT INTO store_vendor_items (vendor_id, item_id, last_quoted_price)
        VALUES ($1, $2, $3)
        ON CONFLICT (vendor_id, item_id) DO UPDATE
        SET last_quoted_price = EXCLUDED.last_quoted_price
      `, [vendor_id, it.item_id, price]);

      // Record to store_stock_history
      await client.query(`
        INSERT INTO store_stock_history (
          store_id, item_id, movement_type, reference_id, quantity_change,
          stock_before, stock_after, unit_price, total_value, performed_by_name, reason
        ) VALUES ($1, $2, 'PURCHASE_RECEIPT', $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        store_id, it.item_id, purchaseNum, qty, stockBefore, stockAfter,
        price, lineTotal, userName, `Purchased from ${vendorName} (Inv: ${invoice_number || 'N/A'})`
      ]);
    }

    // 5. Vendor Ledger Entry
    await client.query(`
      INSERT INTO store_vendor_transactions (
        vendor_id, purchase_id, transaction_type, amount, payment_method,
        reference_number, performed_by_name, comments
      ) VALUES ($1, $2, 'PURCHASE_BILL', $3, $4, $5, $6, $7)
    `, [
      vendor_id, createdPurchase.id, totalAmount, payment_method || 'Cash',
      purchaseNum, userName, `Invoice #${invoice_number || 'N/A'} for ${store.name}`
    ]);

    // If marked Paid immediately, insert compensating payment in vendor ledger
    if (createdPurchase.payment_status === 'Paid') {
      await client.query(`
        INSERT INTO store_vendor_transactions (
          vendor_id, purchase_id, transaction_type, amount, payment_method,
          reference_number, performed_by_name, comments
        ) VALUES ($1, $2, 'PAYMENT', $3, $4, $5, $6, $7)
      `, [
        vendor_id, createdPurchase.id, totalAmount, payment_method || 'Cash',
        `PAY-${purchaseNum}`, userName, `Settlement for Invoice #${invoice_number || purchaseNum}`
      ]);
    } else {
      // Increase vendor balance
      await client.query(`
        UPDATE store_vendors SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2
      `, [totalAmount, vendor_id]);
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: 'Purchase registered successfully and store inventory incremented.',
      purchase: createdPurchase
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating purchase:', err);
    res.status(500).json({ error: 'Failed to create purchase: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
