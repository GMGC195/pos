const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken, isAdmin } = require('../../middleware/auth');

// -------------------------------------------------------------
// GET /api/store/inventory (List stock levels per location)
// -------------------------------------------------------------
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { store_id, branch, category_id, search, low_stock_only } = req.query;
    let query = `
      SELECT 
        inv.*,
        si.name as item_name,
        si.arabic_name,
        si.item_code,
        si.primary_unit,
        si.last_purchase_price,
        sc.name as category_name,
        sc.icon as category_icon,
        sl.name as store_name,
        sl.branch as store_branch,
        (inv.current_stock <= inv.min_stock_level) as is_low_stock,
        GREATEST(0, inv.min_stock_level - inv.current_stock) as replenishment_needed
      FROM store_inventory inv
      JOIN store_items si ON inv.item_id = si.id
      JOIN store_locations sl ON inv.store_id = sl.id
      LEFT JOIN store_categories sc ON si.category_id = sc.id
      WHERE si.status = 'Active'
    `;
    const params = [];

    if (store_id && store_id !== 'All') {
      params.push(parseInt(store_id, 10));
      query += ` AND inv.store_id = $${params.length}`;
    }

    if (branch && branch !== 'All') {
      params.push(branch);
      query += ` AND sl.branch = $${params.length}`;
    }

    if (category_id && category_id !== 'All') {
      params.push(parseInt(category_id, 10));
      query += ` AND si.category_id = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(si.name) LIKE $${params.length} OR LOWER(si.item_code) LIKE $${params.length} OR LOWER(COALESCE(si.arabic_name, '')) LIKE $${params.length})`;
    }

    if (low_stock_only === 'true') {
      query += ` AND inv.current_stock <= inv.min_stock_level`;
    }

    query += ' ORDER BY sl.branch ASC, sc.sort_order ASC, si.name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching store inventory:', err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// -------------------------------------------------------------
// GET /api/store/inventory/alerts (Low-stock items requiring reorder)
// -------------------------------------------------------------
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const { branch } = req.query;
    let query = `
      SELECT 
        inv.*,
        si.name as item_name,
        si.arabic_name,
        si.item_code,
        si.primary_unit,
        si.reorder_quantity,
        si.last_purchase_price,
        sl.name as store_name,
        sl.branch as store_branch,
        sc.name as category_name,
        GREATEST(0, inv.min_stock_level - inv.current_stock) as replenishment_needed
      FROM store_inventory inv
      JOIN store_items si ON inv.item_id = si.id
      JOIN store_locations sl ON inv.store_id = sl.id
      LEFT JOIN store_categories sc ON si.category_id = sc.id
      WHERE si.status = 'Active' AND inv.current_stock <= inv.min_stock_level
    `;
    const params = [];

    if (branch && branch !== 'All') {
      params.push(branch);
      query += ` AND sl.branch = $${params.length}`;
    }

    query += ' ORDER BY replenishment_needed DESC, sl.branch ASC, si.name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching inventory alerts:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// -------------------------------------------------------------
// POST /api/store/inventory/adjust (Manual Stock Adjustment with Audit Reason)
// -------------------------------------------------------------
router.post('/adjust', authenticateToken, async (req, res) => {
  const { store_id, item_id, adjusted_quantity, reason, notes } = req.body;

  if (!store_id || !item_id || adjusted_quantity === undefined) {
    return res.status(400).json({ error: 'Store ID, Item ID, and new adjusted quantity are required' });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A mandatory reason is required for manual stock adjustments (e.g. Spoilage, Damage, Physical Audit).' });
  }

  const targetQty = Math.max(0, parseFloat(adjusted_quantity) || 0);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invRes = await client.query(`
      SELECT current_stock FROM store_inventory WHERE store_id = $1 AND item_id = $2 FOR UPDATE
    `, [store_id, item_id]);

    let stockBefore = 0;
    if (invRes.rows.length === 0) {
      await client.query(`
        INSERT INTO store_inventory (store_id, item_id, current_stock, updated_at)
        VALUES ($1, $2, $3, NOW())
      `, [store_id, item_id, targetQty]);
      stockBefore = 0;
    } else {
      stockBefore = parseFloat(invRes.rows[0].current_stock) || 0;
      await client.query(`
        UPDATE store_inventory
        SET current_stock = $1, updated_at = NOW()
        WHERE store_id = $2 AND item_id = $3
      `, [targetQty, store_id, item_id]);
    }

    const qtyDiff = targetQty - stockBefore;
    const userName = req.user?.username || req.user?.name || 'Store Manager';

    // Record audit movement
    await client.query(`
      INSERT INTO store_stock_history (
        store_id, item_id, movement_type, reference_id, quantity_change,
        stock_before, stock_after, performed_by_name, reason
      ) VALUES ($1, $2, 'MANUAL_ADJUSTMENT', $3, $4, $5, $6, $7, $8)
    `, [
      store_id, item_id, `ADJ-${Date.now().toString().slice(-6)}`,
      qtyDiff, stockBefore, targetQty, userName, `${reason.trim()} ${notes ? '(' + notes.trim() + ')' : ''}`
    ]);

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Stock adjusted successfully.',
      stock_before: stockBefore,
      current_stock: targetQty,
      difference: qtyDiff
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error adjusting inventory:', err);
    res.status(500).json({ error: 'Failed to adjust inventory: ' + err.message });
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// GET /api/store/inventory/:itemId/history (Item movement audit trail)
// -------------------------------------------------------------
router.get('/:itemId/history', authenticateToken, async (req, res) => {
  const { itemId } = req.params;
  const { store_id } = req.query;

  try {
    let query = `
      SELECT sh.*, sl.name as store_name, sl.branch as store_branch
      FROM store_stock_history sh
      JOIN store_locations sl ON sh.store_id = sl.id
      WHERE sh.item_id = $1
    `;
    const params = [itemId];

    if (store_id && store_id !== 'All') {
      params.push(parseInt(store_id, 10));
      query += ` AND sh.store_id = $${params.length}`;
    }

    query += ' ORDER BY sh.created_at DESC LIMIT 100';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching item stock history:', err);
    res.status(500).json({ error: 'Failed to fetch item history' });
  }
});

module.exports = router;
