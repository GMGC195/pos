const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken, isAdmin } = require('../../middleware/auth');
const { requireStoreRoles } = require('../../middleware/storeAuth');

// -------------------------------------------------------------
// GET /api/store/vendors (List all vendors)
// -------------------------------------------------------------
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT 
        v.*,
        (SELECT COUNT(*) FROM store_purchases WHERE vendor_id = v.id) as total_purchases_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM store_purchases WHERE vendor_id = v.id) as total_purchases_value
      FROM store_vendors v
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'All') {
      params.push(status);
      query += ` AND v.status = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(v.name) LIKE $${params.length} OR LOWER(COALESCE(v.contact_person, '')) LIKE $${params.length} OR LOWER(COALESCE(v.phone, '')) LIKE $${params.length})`;
    }

    query += ' ORDER BY v.name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching vendors:', err);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// -------------------------------------------------------------
// GET /api/store/vendors/:id/items (All active menu items supplied by vendor)
// -------------------------------------------------------------
router.get('/:id/items', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const vendorId = parseInt(id, 10);
  if (isNaN(vendorId)) {
    return res.status(400).json({ error: 'Valid vendor ID is required' });
  }
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (si.id)
        si.id AS item_id,
        si.item_code,
        si.name AS item_name,
        si.arabic_name,
        si.primary_unit,
        si.last_purchase_price,
        sc.name AS category_name,
        COALESCE(vi.last_quoted_price, si.last_purchase_price, 0) AS unit_price
      FROM store_items si
      LEFT JOIN store_vendor_items vi ON (vi.item_id = si.id AND vi.vendor_id = $1)
      LEFT JOIN store_categories sc ON si.category_id = sc.id
      WHERE si.status = 'Active'
        AND (si.default_vendor_id = $1 OR vi.vendor_id = $1)
      ORDER BY si.id, sc.sort_order ASC, si.name ASC
    `, [vendorId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching vendor items:', err);
    res.status(500).json({ error: 'Failed to fetch vendor items' });
  }
});

// -------------------------------------------------------------
// GET /api/store/vendors/:id (Vendor profile + supplied items)
// -------------------------------------------------------------
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const vRes = await pool.query('SELECT * FROM store_vendors WHERE id = $1', [id]);
    if (vRes.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const itemsRes = await pool.query(`
      SELECT 
        vi.*,
        si.name as item_name,
        si.item_code,
        si.primary_unit,
        sc.name as category_name
      FROM store_vendor_items vi
      JOIN store_items si ON vi.item_id = si.id
      LEFT JOIN store_categories sc ON si.category_id = sc.id
      WHERE vi.vendor_id = $1
      ORDER BY si.name ASC
    `, [id]);

    res.json({
      vendor: vRes.rows[0],
      items: itemsRes.rows
    });
  } catch (err) {
    console.error('Error fetching vendor profile:', err);
    res.status(500).json({ error: 'Failed to fetch vendor profile' });
  }
});

// -------------------------------------------------------------
// POST /api/store/vendors (Create Vendor)
// -------------------------------------------------------------
router.post('/', authenticateToken, requireStoreRoles(['admin', 'developer']), async (req, res) => {
  const {
    name, contact_person, phone, whatsapp, email,
    address, tax_number, payment_terms, notes, item_ids
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Vendor name is required' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO store_vendors (
        name, contact_person, phone, whatsapp, email,
        address, tax_number, payment_terms, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Active')
      RETURNING *
    `, [
      name.trim(), contact_person?.trim() || null, phone?.trim() || null,
      whatsapp?.trim() || null, email?.trim() || null, address?.trim() || null,
      tax_number?.trim() || null, payment_terms || 'Cash', notes || null
    ]);

    const createdVendor = result.rows[0];
    if (Array.isArray(item_ids) && item_ids.length > 0) {
      for (const rawItemId of item_ids) {
        const itemId = parseInt(rawItemId, 10);
        if (!isNaN(itemId)) {
          await pool.query(
            `INSERT INTO store_vendor_items (vendor_id, item_id) VALUES ($1, $2) ON CONFLICT (vendor_id, item_id) DO NOTHING`,
            [createdVendor.id, itemId]
          );
        }
      }
    }

    res.status(201).json(createdVendor);
  } catch (err) {
    console.error('Error creating vendor:', err);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

// -------------------------------------------------------------
// PUT /api/store/vendors/:id (Update Vendor)
// -------------------------------------------------------------
router.put('/:id', authenticateToken, requireStoreRoles(['admin', 'developer']), async (req, res) => {
  const { id } = req.params;
  const {
    name, contact_person, phone, whatsapp, email,
    address, tax_number, payment_terms, notes, status, item_ids
  } = req.body;

  try {
    const result = await pool.query(`
      UPDATE store_vendors
      SET name = COALESCE($1, name),
          contact_person = COALESCE($2, contact_person),
          phone = COALESCE($3, phone),
          whatsapp = COALESCE($4, whatsapp),
          email = COALESCE($5, email),
          address = COALESCE($6, address),
          tax_number = COALESCE($7, tax_number),
          payment_terms = COALESCE($8, payment_terms),
          notes = COALESCE($9, notes),
          status = COALESCE($10, status),
          updated_at = NOW()
      WHERE id = $11 RETURNING *
    `, [
      name, contact_person, phone, whatsapp, email,
      address, tax_number, payment_terms, notes, status, id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    if (Array.isArray(item_ids)) {
      const cleanItemIds = item_ids.map(x => parseInt(x, 10)).filter(x => !isNaN(x));
      await pool.query('DELETE FROM store_vendor_items WHERE vendor_id = $1', [id]);
      for (const itemId of cleanItemIds) {
        await pool.query(
          `INSERT INTO store_vendor_items (vendor_id, item_id) VALUES ($1, $2) ON CONFLICT (vendor_id, item_id) DO NOTHING`,
          [id, itemId]
        );
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating vendor:', err);
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

// -------------------------------------------------------------
// DELETE /api/store/vendors/:id (Delete or Archive Vendor)
// -------------------------------------------------------------
router.delete('/:id', authenticateToken, requireStoreRoles(['admin', 'developer']), async (req, res) => {
  const { id } = req.params;
  try {
    const purCheck = await pool.query('SELECT COUNT(*) FROM store_purchases WHERE vendor_id = $1', [id]);
    if (parseInt(purCheck.rows[0].count, 10) > 0) {
      const archived = await pool.query(
        `UPDATE store_vendors SET status = 'Inactive', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      if (archived.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
      return res.json({ message: 'Vendor has purchase history and was marked Inactive.', archived: true });
    }
    const delRes = await pool.query('DELETE FROM store_vendors WHERE id = $1 RETURNING id', [id]);
    if (delRes.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ message: 'Vendor deleted successfully', archived: false });
  } catch (err) {
    console.error('Error deleting vendor:', err);
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

// -------------------------------------------------------------
// GET /api/store/vendors/:id/ledger (or :id/statement)
// -------------------------------------------------------------
const getVendorLedgerHandler = async (req, res) => {
  const { id } = req.params;
  try {
    const vRes = await pool.query('SELECT name, current_balance, payment_terms FROM store_vendors WHERE id = $1', [id]);
    if (vRes.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const txRes = await pool.query(`
      SELECT vt.*, p.purchase_number, p.invoice_number
      FROM store_vendor_transactions vt
      LEFT JOIN store_purchases p ON vt.purchase_id = p.id
      WHERE vt.vendor_id = $1
      ORDER BY vt.created_at DESC, vt.id DESC
    `, [id]);

    res.json({
      vendor: vRes.rows[0],
      transactions: txRes.rows
    });
  } catch (err) {
    console.error('Error fetching vendor ledger:', err);
    res.status(500).json({ error: 'Failed to fetch vendor ledger' });
  }
};

router.get('/:id/ledger', authenticateToken, getVendorLedgerHandler);
router.get('/:id/statement', authenticateToken, getVendorLedgerHandler);

// -------------------------------------------------------------
// POST /api/store/vendors/:id/payment (or :id/payments)
// -------------------------------------------------------------
const recordPaymentHandler = async (req, res) => {
  const { id } = req.params;
  const { amount, payment_method, reference_number, comments, notes } = req.body;

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Valid positive payment amount required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const vCheck = await client.query('SELECT name, current_balance FROM store_vendors WHERE id = $1 FOR UPDATE', [id]);
    if (vCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const userName = req.user?.username || req.user?.name || 'Accountant';

    // Insert payment in vendor ledger
    const txRes = await client.query(`
      INSERT INTO store_vendor_transactions (
        vendor_id, transaction_type, amount, payment_method,
        reference_number, performed_by_name, comments
      ) VALUES ($1, 'PAYMENT', $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      id, numAmount, payment_method || 'Cash',
      reference_number || `PV-${Date.now().toString().slice(-6)}`,
      userName, comments || notes || 'Payment to vendor'
    ]);

    // Decrement vendor balance
    const updRes = await client.query(`
      UPDATE store_vendors
      SET current_balance = current_balance - $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING current_balance
    `, [numAmount, id]);

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: 'Vendor payment recorded successfully.',
      new_balance: updRes.rows[0].current_balance,
      transaction: txRes.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error recording vendor payment:', err);
    res.status(500).json({ error: 'Failed to record vendor payment: ' + err.message });
  } finally {
    client.release();
  }
};

router.post('/:id/payment', authenticateToken, requireStoreRoles(['admin', 'developer']), recordPaymentHandler);
router.post('/:id/payments', authenticateToken, requireStoreRoles(['admin', 'developer']), recordPaymentHandler);

module.exports = router;
