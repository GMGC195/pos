const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../../middleware/auth');
const { requireStoreRoles } = require('../../middleware/storeAuth');

// -------------------------------------------------------------
// GET /api/store/dashboard/metrics
// -------------------------------------------------------------
router.get('/metrics', authenticateToken, requireStoreRoles(['admin', 'developer', 'management', 'management store']), async (req, res) => {
  try {
    const { store_id, branch } = req.query;

    const branchFilter = branch && branch !== 'All' ? branch : null;
    const storeFilter = store_id && store_id !== 'All' ? parseInt(store_id, 10) : null;

    let storeJoin = 'JOIN store_locations sl ON inv.store_id = sl.id';
    let storeWhere = '1=1';
    const params = [];

    if (storeFilter) {
      params.push(storeFilter);
      storeWhere += ` AND inv.store_id = $${params.length}`;
    } else if (branchFilter) {
      params.push(branchFilter);
      storeWhere += ` AND sl.branch = $${params.length}`;
    }

    // 1. Total Store Items Count
    const itemsCountRes = await pool.query("SELECT COUNT(*) FROM store_items WHERE status = 'Active'");
    const totalItems = parseInt(itemsCountRes.rows[0].count, 10);

    // 2. Current Inventory Valuation & Low Stock Count
    const invMetricsRes = await pool.query(`
      SELECT 
        COUNT(*) as total_inventory_records,
        COALESCE(SUM(inv.current_stock * si.last_purchase_price), 0) as total_stock_value,
        COALESCE(SUM(CASE WHEN inv.current_stock <= inv.min_stock_level THEN 1 ELSE 0 END), 0) as low_stock_count
      FROM store_inventory inv
      JOIN store_items si ON inv.item_id = si.id
      ${storeJoin}
      WHERE ${storeWhere} AND si.status = 'Active'
    `, params);

    const totalStockValue = parseFloat(invMetricsRes.rows[0]?.total_stock_value) || 0;
    const lowStockCount = parseInt(invMetricsRes.rows[0]?.low_stock_count) || 0;

    // 3. Today's Purchases
    let purWhere = "p.invoice_date = CURRENT_DATE AND p.status = 'Received'";
    const purParams = [];
    if (storeFilter) {
      purParams.push(storeFilter);
      purWhere += ` AND p.store_id = $${purParams.length}`;
    } else if (branchFilter) {
      purParams.push(branchFilter);
      purWhere += ` AND p.branch = $${purParams.length}`;
    }

    const todayPurRes = await pool.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(p.total_amount), 0) as total_value
      FROM store_purchases p
      WHERE ${purWhere}
    `, purParams);

    const todayPurchasesCount = parseInt(todayPurRes.rows[0]?.count) || 0;
    const todayPurchasesValue = parseFloat(todayPurRes.rows[0]?.total_value) || 0;

    // 4. Today's Shift Submissions & Consumption
    let entryWhere = "e.entry_date = CURRENT_DATE AND e.status = 'Submitted'";
    const entryParams = [];
    if (storeFilter) {
      entryParams.push(storeFilter);
      entryWhere += ` AND e.store_id = $${entryParams.length}`;
    } else if (branchFilter) {
      entryParams.push(branchFilter);
      entryWhere += ` AND e.branch = $${entryParams.length}`;
    }

    const todayEntryRes = await pool.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(e.total_consumption_value), 0) as total_consumption
      FROM store_stock_entries e
      WHERE ${entryWhere}
    `, entryParams);

    const todayShiftsSubmitted = parseInt(todayEntryRes.rows[0]?.count) || 0;
    const todayConsumptionValue = parseFloat(todayEntryRes.rows[0]?.total_consumption) || 0;

    // 5. Pending Item Requests
    let reqWhere = "r.status = 'Pending'";
    const reqParams = [];
    if (branchFilter) {
      reqParams.push(branchFilter);
      reqWhere += ` AND r.branch = $${reqParams.length}`;
    }
    const pendingReqRes = await pool.query(`SELECT COUNT(*) FROM store_item_requests r WHERE ${reqWhere}`, reqParams);
    const pendingRequestsCount = parseInt(pendingReqRes.rows[0].count) || 0;

    // 6. Recent Stock Movements (last 8)
    let histWhere = '1=1';
    const histParams = [];
    if (storeFilter) {
      histParams.push(storeFilter);
      histWhere += ` AND sh.store_id = $${histParams.length}`;
    } else if (branchFilter) {
      histParams.push(branchFilter);
      histWhere += ` AND sl.branch = $${histParams.length}`;
    }

    const recentMovementsRes = await pool.query(`
      SELECT 
        sh.*,
        si.name as item_name,
        si.item_code,
        sl.branch as branch
      FROM store_stock_history sh
      JOIN store_items si ON sh.item_id = si.id
      JOIN store_locations sl ON sh.store_id = sl.id
      WHERE ${histWhere}
      ORDER BY sh.created_at DESC
      LIMIT 8
    `, histParams);

    // 7. Recent Purchases (last 5)
    let recentPurWhere = "p.status = 'Received'";
    const recentPurParams = [];
    if (storeFilter) {
      recentPurParams.push(storeFilter);
      recentPurWhere += ` AND p.store_id = $${recentPurParams.length}`;
    } else if (branchFilter) {
      recentPurParams.push(branchFilter);
      recentPurWhere += ` AND p.branch = $${recentPurParams.length}`;
    }

    const recentPurchasesRes = await pool.query(`
      SELECT 
        p.*,
        v.name as vendor_name,
        sl.branch as branch
      FROM store_purchases p
      JOIN store_vendors v ON p.vendor_id = v.id
      JOIN store_locations sl ON p.store_id = sl.id
      WHERE ${recentPurWhere}
      ORDER BY p.created_at DESC
      LIMIT 5
    `, recentPurParams);

    res.json({
      metrics: {
        total_items: totalItems,
        total_stock_value: Math.round(totalStockValue * 100) / 100,
        low_stock_count: lowStockCount,
        today_purchases_count: todayPurchasesCount,
        today_purchases_value: Math.round(todayPurchasesValue * 100) / 100,
        today_shifts_submitted: todayShiftsSubmitted,
        today_consumption_value: Math.round(todayConsumptionValue * 100) / 100,
        pending_requests_count: pendingRequestsCount
      },
      recent_movements: recentMovementsRes.rows,
      recent_purchases: recentPurchasesRes.rows
    });
  } catch (err) {
    console.error('Error fetching store dashboard metrics:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

module.exports = router;
