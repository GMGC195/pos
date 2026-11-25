const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../../middleware/auth');
const { requireStoreRoles, enforceBranchAccess, resolveBranchStoreId } = require('../../middleware/storeAuth');
const { recordActivityLog } = require('../activityLogs');

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
router.get('/', authenticateToken, requireStoreRoles(['admin', 'developer', 'management', 'store man', 'data entry']), async (req, res) => {
  try {
    const { store_id, branch, vendor_id, from_date, to_date, payment_status } = req.query;
    const access = await enforceBranchAccess(req, res, { branch, store_id });
    if (!access.ok) return;

    let query = `
      SELECT 
        p.*,
        v.name as vendor_name,
        v.phone as vendor_phone,
        sl.name as store_name
      FROM store_purchases p
      JOIN store_vendors v ON p.vendor_id = v.id
      JOIN store_locations sl ON p.store_id = sl.id
      WHERE p.status != 'Draft'
    `;
    const params = [];

    if (access.allowedBranches) {
      params.push(access.allowedBranches);
      query += ` AND p.branch = ANY($${params.length})`;
    }

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
// GET /api/store/purchases/drafts (List saved draft purchases)
// -------------------------------------------------------------
router.get('/drafts', authenticateToken, requireStoreRoles(['admin', 'developer', 'store man', 'data entry']), async (req, res) => {
  try {
    const { branch, vendor_id } = req.query;
    const access = await enforceBranchAccess(req, res, { branch });
    if (!access.ok) return;

    let query = `
      SELECT 
        p.*,
        v.name as vendor_name,
        v.phone as vendor_phone,
        (SELECT COUNT(*) FROM store_purchase_items pi WHERE pi.purchase_id = p.id) as items_count
      FROM store_purchases p
      JOIN store_vendors v ON p.vendor_id = v.id
      WHERE p.status = 'Draft'
    `;
    const params = [];

    if (access.allowedBranches) {
      params.push(access.allowedBranches);
      query += ` AND p.branch = ANY($${params.length})`;
    }
    if (branch && branch !== 'All') {
      params.push(branch);
      query += ` AND p.branch = $${params.length}`;
    }
    if (vendor_id && vendor_id !== 'All') {
      params.push(parseInt(vendor_id, 10));
      query += ` AND p.vendor_id = $${params.length}`;
    }

    query += ' ORDER BY p.updated_at DESC, p.id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching draft purchases:', err);
    res.status(500).json({ error: 'Failed to fetch draft purchases' });
  }
});

// -------------------------------------------------------------
// GET /api/store/purchases/drafts/active (Restore latest active draft)
// -------------------------------------------------------------
router.get('/drafts/active', authenticateToken, requireStoreRoles(['admin', 'developer', 'store man', 'data entry']), async (req, res) => {
  try {
    const { vendor_id, branch } = req.query;
    const access = await enforceBranchAccess(req, res, { branch });
    if (!access.ok) return;

    let query = `
      SELECT p.*, v.name as vendor_name
      FROM store_purchases p
      JOIN store_vendors v ON p.vendor_id = v.id
      WHERE p.status = 'Draft'
    `;
    const params = [];

    if (access.allowedBranches) {
      params.push(access.allowedBranches);
      query += ` AND p.branch = ANY($${params.length})`;
    }
    if (vendor_id && vendor_id !== 'All') {
      params.push(parseInt(vendor_id, 10));
      query += ` AND p.vendor_id = $${params.length}`;
    }
    if (branch && branch !== 'All') {
      params.push(branch);
      query += ` AND p.branch = $${params.length}`;
    }

    query += ' ORDER BY p.updated_at DESC, p.id DESC LIMIT 1';
    const dRes = await pool.query(query, params);
    if (dRes.rows.length === 0) {
      return res.json({ draft: null, items: [] });
    }

    const draft = dRes.rows[0];
    const itemsRes = await pool.query(`
      SELECT pi.*, si.name as item_name, si.item_code, sc.name as category_name
      FROM store_purchase_items pi
      JOIN store_items si ON pi.item_id = si.id
      LEFT JOIN store_categories sc ON si.category_id = sc.id
      WHERE pi.purchase_id = $1
      ORDER BY pi.id ASC
    `, [draft.id]);

    res.json({ draft, items: itemsRes.rows });
  } catch (err) {
    console.error('Error restoring active draft:', err);
    res.status(500).json({ error: 'Failed to restore active draft' });
  }
});

// -------------------------------------------------------------
// POST /api/store/purchases/draft (Save as Draft / Save & Next Category)
// -------------------------------------------------------------
router.post('/draft', authenticateToken, requireStoreRoles(['admin', 'developer', 'store man', 'data entry']), async (req, res) => {
  const {
    draft_id, vendor_id, branch, invoice_number, invoice_date,
    payment_method, payment_status, notes, completed_categories,
    last_active_category, items
  } = req.body;

  if (!vendor_id || !branch || branch === 'All') {
    return res.status(400).json({ error: 'Vendor and branch are required to save a draft' });
  }

  const resolvedStoreId = await resolveBranchStoreId(pool, branch);
  if (!resolvedStoreId) {
    return res.status(400).json({ error: 'Valid branch (Branch 1, Branch 2, or Branch 3) is required' });
  }

  const access = await enforceBranchAccess(req, res, { branch, store_id: resolvedStoreId });
  if (!access.ok) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const safeItems = Array.isArray(items) ? items.filter(it => it.item_id && parseFloat(it.quantity) > 0) : [];
    let subtotal = 0;
    for (const it of safeItems) {
      const qty = parseFloat(it.quantity) || 0;
      const lineTotal = it.total_price !== undefined ? (parseFloat(it.total_price) || 0) : qty * (parseFloat(it.unit_price) || 0);
      subtotal += lineTotal;
    }
    subtotal = Math.round(subtotal * 100) / 100;

    const userName = req.user?.username || req.user?.name || 'Store Staff';
    const completedCatsJson = JSON.stringify(Array.isArray(completed_categories) ? completed_categories : []);
    const activeCat = last_active_category || 'All';
    const invDate = invoice_date || new Date().toISOString().slice(0, 10);

    let draftRow;
    if (draft_id) {
      const existing = await client.query('SELECT * FROM store_purchases WHERE id = $1 FOR UPDATE', [draft_id]);
      if (existing.rows.length > 0 && existing.rows[0].status === 'Draft') {
        const upd = await client.query(`
          UPDATE store_purchases
          SET vendor_id = $1, store_id = $2, branch = $3, invoice_number = $4,
              invoice_date = $5, delivery_date = $5, subtotal = $6, total_amount = $6,
              payment_method = $7, payment_status = $8, notes = $9,
              completed_categories = $10::jsonb, last_active_category = $11, updated_at = NOW()
          WHERE id = $12
          RETURNING *
        `, [
          vendor_id, resolvedStoreId, branch, invoice_number?.trim() || null,
          invDate, subtotal, payment_method || 'Cash', payment_status || 'Unpaid',
          notes || null, completedCatsJson, activeCat, draft_id
        ]);
        draftRow = upd.rows[0];
        await client.query('DELETE FROM store_purchase_items WHERE purchase_id = $1', [draftRow.id]);
      }
    }

    if (!draftRow) {
      const draftNum = `DFT-${Date.now().toString().slice(-8)}-${Math.floor(10 + Math.random() * 90)}`;
      const ins = await client.query(`
        INSERT INTO store_purchases (
          purchase_number, vendor_id, store_id, branch, invoice_number, invoice_date,
          delivery_date, subtotal, tax_amount, total_amount, payment_method, payment_status,
          status, received_by_user_id, received_by_name, notes, completed_categories, last_active_category
        ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, 0, $7, $8, $9, 'Draft', $10, $11, $12, $13::jsonb, $14)
        RETURNING *
      `, [
        draftNum, vendor_id, resolvedStoreId, branch, invoice_number?.trim() || null,
        invDate, subtotal, payment_method || 'Cash', payment_status || 'Unpaid',
        req.user?.id || null, userName, notes || null, completedCatsJson, activeCat
      ]);
      draftRow = ins.rows[0];
    }

    for (const it of safeItems) {
      const qty = parseFloat(it.quantity);
      const lineTotal = it.total_price !== undefined ? (parseFloat(it.total_price) || 0) : Math.round(qty * (parseFloat(it.unit_price) || 0) * 100) / 100;
      const unitPrice = qty > 0 ? Math.round((lineTotal / qty) * 10000) / 10000 : 0;
      await client.query(`
        INSERT INTO store_purchase_items (
          purchase_id, item_id, quantity, unit, unit_price, tax_rate, tax_amount, total_price
        ) VALUES ($1, $2, $3, $4, $5, 0, 0, $6)
      `, [draftRow.id, it.item_id, qty, it.unit || 'KG', unitPrice, lineTotal]);
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Draft saved', draft: draftRow });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving draft purchase:', err);
    res.status(500).json({ error: 'Failed to save draft purchase: ' + err.message });
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// DELETE /api/store/purchases/drafts/:id
// -------------------------------------------------------------
router.delete('/drafts/:id', authenticateToken, requireStoreRoles(['admin', 'developer', 'store man', 'data entry']), async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query("SELECT id, branch, store_id, status FROM store_purchases WHERE id = $1", [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Draft not found' });
    if (check.rows[0].status !== 'Draft') return res.status(400).json({ error: 'Only Draft purchases can be deleted here' });

    const access = await enforceBranchAccess(req, res, { branch: check.rows[0].branch, store_id: check.rows[0].store_id });
    if (!access.ok) return;

    await pool.query("DELETE FROM store_purchases WHERE id = $1 AND status = 'Draft'", [id]);
    res.json({ success: true, message: 'Draft deleted' });
  } catch (err) {
    console.error('Error deleting draft:', err);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// -------------------------------------------------------------
// GET /api/store/purchases/:id (Purchase details with line items)
// -------------------------------------------------------------
router.get('/:id', authenticateToken, requireStoreRoles(['admin', 'developer', 'management', 'store man', 'data entry']), async (req, res) => {
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

    const access = await enforceBranchAccess(req, res, { branch: pRes.rows[0].branch, store_id: pRes.rows[0].store_id });
    if (!access.ok) return;

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
router.post('/', authenticateToken, requireStoreRoles(['admin', 'developer', 'store man', 'data entry']), async (req, res) => {
  const {
    vendor_id, store_id, branch, invoice_number, invoice_date,
    delivery_date, payment_method, payment_status, notes, items
  } = req.body;

  if (!vendor_id || (!store_id && (!branch || branch === 'All')) || !invoice_date) {
    return res.status(400).json({ error: 'Vendor, branch, and invoice date are required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one line item is required' });
  }

  const resolvedStoreId = store_id && store_id !== 'All' ? parseInt(store_id, 10) : await resolveBranchStoreId(pool, branch);
  if (!resolvedStoreId) {
    return res.status(400).json({ error: 'Valid branch (Branch 1, Branch 2, or Branch 3) is required' });
  }

  const access = await enforceBranchAccess(req, res, { branch, store_id: resolvedStoreId });
  if (!access.ok) return;

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

    const sCheck = await client.query('SELECT branch, name FROM store_locations WHERE id = $1', [resolvedStoreId]);
    if (sCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Branch store not found' });
    }
    const store = sCheck.rows[0];
    const finalBranch = store.branch;
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
      purchaseNum, vendor_id, resolvedStoreId, finalBranch, invoice_number?.trim() || null,
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
      `, [resolvedStoreId, it.item_id]);

      let stockBefore = 0;
      if (curInvRes.rows.length === 0) {
        await client.query(`
          INSERT INTO store_inventory (store_id, item_id, current_stock, last_received_stock, updated_at)
          VALUES ($1, $2, $3, $3, NOW())
        `, [resolvedStoreId, it.item_id, qty]);
        stockBefore = 0;
      } else {
        stockBefore = parseFloat(curInvRes.rows[0].current_stock) || 0;
        await client.query(`
          UPDATE store_inventory
          SET current_stock = current_stock + $1,
              last_received_stock = $1,
              updated_at = NOW()
          WHERE store_id = $2 AND item_id = $3
        `, [qty, resolvedStoreId, it.item_id]);
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
        resolvedStoreId, it.item_id, purchaseNum, qty, stockBefore, stockAfter,
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

    await recordActivityLog(client, {
      module: 'Store',
      action: 'PURCHASE_CREATED',
      entity_id: createdPurchase.id,
      entity_name: purchaseNum,
      description: `Registered purchase ${purchaseNum} from ${vendorName} (${items.length} items, total ${totalAmount})`,
      new_data: { store_id, branch: store.branch, vendor_id, total_amount: totalAmount },
      performed_by: userName,
      branch: store.branch
    });

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

// -------------------------------------------------------------
// POST /api/store/purchases/:id/complete (Finalize a Draft Purchase)
// -------------------------------------------------------------
router.post('/:id/complete', authenticateToken, requireStoreRoles(['admin', 'developer', 'store man', 'data entry']), async (req, res) => {
  const { id } = req.params;
  const {
    vendor_id, branch, invoice_number, invoice_date,
    payment_method, payment_status, notes, items
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const draftRes = await client.query('SELECT * FROM store_purchases WHERE id = $1 FOR UPDATE', [id]);
    if (draftRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Draft purchase not found' });
    }
    const existingDraft = draftRes.rows[0];
    if (existingDraft.status !== 'Draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This purchase has already been completed and stock has been updated.' });
    }

    const finalBranch = branch && branch !== 'All' ? branch : existingDraft.branch;
    const resolvedStoreId = await resolveBranchStoreId(client, finalBranch);
    const access = await enforceBranchAccess(req, res, { branch: finalBranch, store_id: resolvedStoreId });
    if (!access.ok) {
      await client.query('ROLLBACK');
      return;
    }

    const finalVendorId = vendor_id || existingDraft.vendor_id;
    const vCheck = await client.query('SELECT name FROM store_vendors WHERE id = $1', [finalVendorId]);
    if (vCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vendor not found' });
    }
    const vendorName = vCheck.rows[0].name;

    let finalItems = Array.isArray(items) && items.length > 0 ? items : null;
    if (!finalItems) {
      const dbItems = await client.query('SELECT * FROM store_purchase_items WHERE purchase_id = $1', [id]);
      finalItems = dbItems.rows;
    }
    const activeItems = finalItems.filter(it => it.item_id && parseFloat(it.quantity) > 0);
    if (activeItems.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'At least one item with Quantity Received > 0 is required to complete purchase.' });
    }

    let subtotal = 0;
    for (const it of activeItems) {
      const qty = parseFloat(it.quantity);
      const price = parseFloat(it.unit_price) || 0;
      if (isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
        throw new Error('Invalid quantity or price for line item.');
      }
      subtotal += Math.round(qty * price * 100) / 100;
    }
    const totalAmount = Math.round(subtotal * 100) / 100;
    const purchaseNum = await generatePurchaseNumber(client);
    const userName = req.user?.username || req.user?.name || 'Store Staff';
    const finalMethod = payment_method || existingDraft.payment_method || 'Cash';
    const finalPayStatus = payment_status || existingDraft.payment_status || (finalMethod === 'Cash' ? 'Paid' : 'Unpaid');
    const finalInvDate = invoice_date || existingDraft.invoice_date;

    const upd = await client.query(`
      UPDATE store_purchases
      SET purchase_number = $1, vendor_id = $2, store_id = $3, branch = $4,
          invoice_number = $5, invoice_date = $6, delivery_date = $6,
          subtotal = $7, tax_amount = 0, total_amount = $7,
          payment_method = $8, payment_status = $9, status = 'Received',
          received_by_user_id = $10, received_by_name = $11, notes = $12, updated_at = NOW()
      WHERE id = $13
      RETURNING *
    `, [
      purchaseNum, finalVendorId, resolvedStoreId, finalBranch,
      invoice_number?.trim() || existingDraft.invoice_number || null, finalInvDate,
      totalAmount, finalMethod, finalPayStatus,
      req.user?.id || null, userName, notes || existingDraft.notes || null, id
    ]);
    const completedPurchase = upd.rows[0];

    await client.query('DELETE FROM store_purchase_items WHERE purchase_id = $1', [id]);

    for (const it of activeItems) {
      const qty = parseFloat(it.quantity);
      const price = parseFloat(it.unit_price) || 0;
      const lineTotal = Math.round(qty * price * 100) / 100;

      await client.query(`
        INSERT INTO store_purchase_items (
          purchase_id, item_id, quantity, unit, unit_price, tax_rate, tax_amount, total_price
        ) VALUES ($1, $2, $3, $4, $5, 0, 0, $6)
      `, [id, it.item_id, qty, it.unit || 'KG', price, lineTotal]);

      const curInvRes = await client.query(
        'SELECT current_stock FROM store_inventory WHERE store_id = $1 AND item_id = $2 FOR UPDATE',
        [resolvedStoreId, it.item_id]
      );
      let stockBefore = 0;
      if (curInvRes.rows.length === 0) {
        await client.query(
          'INSERT INTO store_inventory (store_id, item_id, current_stock, last_received_stock, updated_at) VALUES ($1, $2, $3, $3, NOW())',
          [resolvedStoreId, it.item_id, qty]
        );
      } else {
        stockBefore = parseFloat(curInvRes.rows[0].current_stock) || 0;
        await client.query(
          'UPDATE store_inventory SET current_stock = current_stock + $1, last_received_stock = $1, updated_at = NOW() WHERE store_id = $2 AND item_id = $3',
          [qty, resolvedStoreId, it.item_id]
        );
      }
      const stockAfter = stockBefore + qty;

      await client.query(
        'UPDATE store_items SET last_purchase_price = $1, default_vendor_id = COALESCE(default_vendor_id, $2), updated_at = NOW() WHERE id = $3',
        [price, finalVendorId, it.item_id]
      );
      await client.query(
        `INSERT INTO store_vendor_items (vendor_id, item_id, last_quoted_price)
         VALUES ($1, $2, $3)
         ON CONFLICT (vendor_id, item_id) DO UPDATE SET last_quoted_price = EXCLUDED.last_quoted_price`,
        [finalVendorId, it.item_id, price]
      );
      await client.query(`
        INSERT INTO store_stock_history (
          store_id, item_id, movement_type, reference_id, quantity_change,
          stock_before, stock_after, unit_price, total_value, performed_by_name, reason
        ) VALUES ($1, $2, 'PURCHASE_RECEIPT', $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        resolvedStoreId, it.item_id, purchaseNum, qty, stockBefore, stockAfter,
        price, lineTotal, userName, `Completed Draft Purchase from ${vendorName}`
      ]);
    }

    await client.query(`
      INSERT INTO store_vendor_transactions (
        vendor_id, purchase_id, transaction_type, amount, payment_method,
        reference_number, performed_by_name, comments
      ) VALUES ($1, $2, 'PURCHASE_BILL', $3, $4, $5, $6, $7)
    `, [finalVendorId, id, totalAmount, finalMethod, purchaseNum, userName, `Completed Purchase #${purchaseNum}`]);

    if (completedPurchase.payment_status === 'Paid') {
      await client.query(`
        INSERT INTO store_vendor_transactions (
          vendor_id, purchase_id, transaction_type, amount, payment_method,
          reference_number, performed_by_name, comments
        ) VALUES ($1, $2, 'PAYMENT', $3, $4, $5, $6, $7)
      `, [finalVendorId, id, totalAmount, finalMethod, `PAY-${purchaseNum}`, userName, `Settlement for #${purchaseNum}`]);
    } else {
      await client.query(
        'UPDATE store_vendors SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2',
        [totalAmount, finalVendorId]
      );
    }

    await recordActivityLog(client, {
      module: 'Store',
      action: 'PURCHASE_COMPLETED_FROM_DRAFT',
      entity_id: id,
      entity_name: purchaseNum,
      description: `Completed draft purchase ${purchaseNum} from ${vendorName} (${activeItems.length} items, total ${totalAmount})`,
      new_data: { branch: finalBranch, vendor_id: finalVendorId, total_amount: totalAmount },
      performed_by: userName,
      branch: finalBranch
    });

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Draft purchase completed and store inventory updated.',
      purchase: completedPurchase
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error completing draft purchase:', err);
    res.status(500).json({ error: 'Failed to complete draft purchase: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
