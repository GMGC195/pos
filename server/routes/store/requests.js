const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken, isAdmin } = require('../../middleware/auth');

// Helper to generate request number (e.g. REQ-20261117-001)
async function generateRequestNumber(client) {
  const queryFn = client ? client.query.bind(client) : pool.query.bind(pool);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `REQ-${dateStr}-`;

  const res = await queryFn(
    `SELECT request_number FROM store_item_requests 
     WHERE request_number LIKE $1 
     ORDER BY request_number DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let seq = 1;
  if (res.rows.length > 0) {
    const lastNum = parseInt(res.rows[0].request_number.split('-')[2], 10);
    seq = lastNum + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// -------------------------------------------------------------
// GET /api/store/requests (List item requests with filters)
// -------------------------------------------------------------
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { branch, store_id, status } = req.query;
    let query = `
      SELECT 
        ir.*,
        sc.name as category_name,
        sl.name as store_name,
        si.item_code as approved_item_code
      FROM store_item_requests ir
      LEFT JOIN store_categories sc ON ir.category_id = sc.id
      JOIN store_locations sl ON ir.store_id = sl.id
      LEFT JOIN store_items si ON ir.approved_item_id = si.id
      WHERE 1=1
    `;
    const params = [];

    if (branch && branch !== 'All') {
      params.push(branch);
      query += ` AND ir.branch = $${params.length}`;
    }

    if (store_id && store_id !== 'All') {
      params.push(parseInt(store_id, 10));
      query += ` AND ir.store_id = $${params.length}`;
    }

    if (status && status !== 'All') {
      params.push(status);
      query += ` AND ir.status = $${params.length}`;
    }

    query += ' ORDER BY ir.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching item requests:', err);
    res.status(500).json({ error: 'Failed to fetch item requests' });
  }
});

// -------------------------------------------------------------
// POST /api/store/requests (Submit new item request)
// -------------------------------------------------------------
router.post('/', authenticateToken, async (req, res) => {
  const {
    store_id, branch, item_name, category_id, unit,
    required_quantity, min_stock, suggested_vendor, estimated_price, reason
  } = req.body;

  if (!store_id || !item_name || !item_name.trim() || !unit) {
    return res.status(400).json({ error: 'Store location, item name, and unit are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sCheck = await client.query('SELECT branch FROM store_locations WHERE id = $1', [store_id]);
    if (sCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Store location not found' });
    }
    const finalBranch = branch || sCheck.rows[0].branch;
    const reqNum = await generateRequestNumber(client);
    const userName = req.user?.username || req.user?.name || 'Staff';

    const insertRes = await client.query(`
      INSERT INTO store_item_requests (
        request_number, store_id, branch, item_name, category_id,
        unit, required_quantity, min_stock, suggested_vendor, estimated_price,
        requested_by_user_id, requested_by_name, reason, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Pending')
      RETURNING *
    `, [
      reqNum, store_id, finalBranch, item_name.trim(),
      category_id ? parseInt(category_id, 10) : null, unit.trim(),
      parseFloat(required_quantity) || 1.0, parseFloat(min_stock) || 5.0,
      suggested_vendor?.trim() || null, parseFloat(estimated_price) || 0,
      req.user?.id || null, userName, reason?.trim() || null
    ]);

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: 'Item request submitted for management review.',
      request: insertRes.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating item request:', err);
    res.status(500).json({ error: 'Failed to create item request: ' + err.message });
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// POST /api/store/requests/:id/approve (Management Approves & Auto-Creates Item)
// -------------------------------------------------------------
router.post('/:id/approve', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const reqId = parseInt(id, 10);
  if (isNaN(reqId)) {
    return res.status(400).json({ error: 'Valid integer request ID is required' });
  }

  const role = req.user?.role?.trim().toLowerCase();
  if (!['admin', 'developer', 'management', 'store manager'].includes(role)) {
    return res.status(403).json({ error: 'Only Managers and Admins can approve item requests' });
  }

  const { edited_item_name, edited_category_id, edited_unit, min_stock, item_code } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reqRes = await client.query('SELECT * FROM store_item_requests WHERE id = $1 FOR UPDATE', [reqId]);
    if (reqRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item request not found' });
    }

    const itemReq = reqRes.rows[0];
    if (itemReq.status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Request has already been ${itemReq.status.toLowerCase()}` });
    }

    const finalName = (edited_item_name && edited_item_name.trim()) || itemReq.item_name;
    const finalCatId = edited_category_id !== undefined ? edited_category_id : itemReq.category_id;
    const finalUnit = (edited_unit && edited_unit.trim()) || itemReq.unit;
    const finalMinStock = min_stock !== undefined ? parseFloat(min_stock) : itemReq.min_stock;
    const reviewerName = req.user?.username || req.user?.name || 'Manager';

    // Auto-generate code if not passed
    let finalCode = item_code?.trim();
    if (!finalCode) {
      const lastCodeRes = await client.query(`
        SELECT item_code FROM store_items 
        WHERE item_code ~ '^STR-[0-9]+$'
        ORDER BY CAST(SUBSTRING(item_code FROM 5) AS INTEGER) DESC 
        LIMIT 1
      `);
      let seq = 1001;
      if (lastCodeRes.rows.length > 0) {
        seq = parseInt(lastCodeRes.rows[0].item_code.split('-')[1], 10) + 1;
      }
      finalCode = `STR-${seq}`;
    }

    // Create item in store_items catalog
    const insItemRes = await client.query(`
      INSERT INTO store_items (
        item_code, name, category_id, primary_unit, min_stock_level,
        last_purchase_price, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Active')
      RETURNING id, item_code, name
    `, [
      finalCode, finalName, finalCatId, finalUnit, finalMinStock,
      itemReq.estimated_price || 0, `Created via Request #${itemReq.request_number}`
    ]);

    const createdItem = insItemRes.rows[0];

    // Initialize inventory for this store location
    await client.query(`
      INSERT INTO store_inventory (store_id, item_id, current_stock, min_stock_level)
      VALUES ($1, $2, 0, $3)
      ON CONFLICT (store_id, item_id) DO NOTHING
    `, [itemReq.store_id, createdItem.id, finalMinStock]);

    // Update request record
    const updReqRes = await client.query(`
      UPDATE store_item_requests
      SET status = 'Approved',
          reviewed_by_name = $1,
          reviewed_at = NOW(),
          approved_item_id = $2
      WHERE id = $3
      RETURNING *
    `, [reviewerName, createdItem.id, id]);

    await client.query('COMMIT');
    res.json({
      success: true,
      message: `Request approved. Item '${createdItem.name}' (${createdItem.item_code}) has been added to Store Items.`,
      request: updReqRes.rows[0],
      item: createdItem
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error approving item request:', err);
    res.status(500).json({ error: 'Failed to approve item request: ' + err.message });
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// POST /api/store/requests/:id/reject (Management Rejects with Reason)
// -------------------------------------------------------------
router.post('/:id/reject', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const reqId = parseInt(id, 10);
  if (isNaN(reqId)) {
    return res.status(400).json({ error: 'Valid integer request ID is required' });
  }

  const { rejection_reason } = req.body;

  const role = req.user?.role?.trim().toLowerCase();
  if (!['admin', 'developer', 'management', 'store manager'].includes(role)) {
    return res.status(403).json({ error: 'Only Managers and Admins can reject item requests' });
  }

  if (!rejection_reason || !rejection_reason.trim()) {
    return res.status(400).json({ error: 'A mandatory rejection reason is required' });
  }

  try {
    const reviewerName = req.user?.username || req.user?.name || 'Manager';
    const result = await pool.query(`
      UPDATE store_item_requests
      SET status = 'Rejected',
          reviewed_by_name = $1,
          reviewed_at = NOW(),
          rejection_reason = $2
      WHERE id = $3 AND status = 'Pending'
      RETURNING *
    `, [reviewerName, rejection_reason.trim(), id]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Request not found or is no longer Pending' });
    }

    res.json({
      success: true,
      message: 'Item request rejected.',
      request: result.rows[0]
    });
  } catch (err) {
    console.error('Error rejecting item request:', err);
    res.status(500).json({ error: 'Failed to reject item request' });
  }
});

module.exports = router;
