const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET comprehensive stats for Dashboard
router.get('/', authenticateToken, async (req, res) => {
  try {
    let { branch, closing_id } = req.query;
    const role = req.user.role?.trim().toLowerCase();
    const isAdmin = role === 'admin' || role === 'developer';
    if (!isAdmin) {
      if (!req.user?.branch || req.user.branch === 'All') {
        return res.json({
          totalSale: 0,
          dailyRevenue: 0,
          totalProductCost: 0,
          totalOrders: 0,
          guestsToday: 0,
          last7Days: [],
          topItems: []
        });
      }
      branch = req.user.branch;
    }
    let branchCond = '';
    let branchCondO = '';
    let params = [];
    
    if (branch && branch !== 'All') {
      branchCond = 'AND branch = $1';
      branchCondO = 'AND o.branch = $1';
      params.push(branch);
    }

    // If closing_id is provided (usually by admin), fetch from shift_closings
    if (closing_id) {
      const closingRes = await pool.query(`SELECT * FROM shift_closings WHERE id = $1`, [closing_id]);
      if (closingRes.rows.length > 0) {
        const closing = closingRes.rows[0];
        
        let items = [];
        try { items = JSON.parse(closing.items_summary); } catch (e) {}
        
        // We might not have full history and guests for a specific shift easily, 
        // but we can return the exact sales and orders.
        return res.json({
          totalSale: parseFloat(closing.total_sales || 0),
          dailyRevenue: parseFloat(closing.total_sales || 0), // approximation or we can leave it
          totalProductCost: 0, // Not saved in shift_closings yet
          totalOrders: parseInt(closing.total_orders || 0),
          guestsToday: parseInt(closing.total_orders || 0),
          last7Days: [],
          topItems: items.map(i => ({ name: i.category, value: parseInt(i.qty) }))
        });
      }
    }

    // Cashier should only see the current unclosed shift
    const isCashier = role === 'cashier';
    const shiftCond = isCashier ? 'AND is_shift_closed = FALSE' : '';
    const shiftCondO = isCashier ? 'AND o.is_shift_closed = FALSE' : '';

    // Total Saleh (Today's completed orders grand total)
    const totalSaleResult = await pool.query(`
      SELECT COALESCE(SUM(grand_total), 0) as total_sale
      FROM orders
      WHERE DATE(created_at) = CURRENT_DATE AND status = 'Completed' ${branchCond} ${shiftCond}
    `, params);

    // Daily Revenue (Today's Sales - Produce Cost)
    const dailyRevenueResult = await pool.query(`
      WITH recipe_costs AS (
        SELECT 
          r.item_id,
          SUM(r.quantity_used * s.price_per_unit) as produce_cost_per_unit
        FROM recipes r
        JOIN stock s ON r.stock_id = s.id
        GROUP BY r.item_id
      ),
      day_items AS (
        SELECT 
          oi.item_id,
          SUM(oi.qty) as total_qty,
          SUM(oi.qty * oi.unit_price) as total_price,
          SUM(CASE 
            WHEN o.subtotal > 0 THEN (oi.qty * oi.unit_price / o.subtotal) * o.discount 
            ELSE 0 
          END) as total_discount
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status = 'Completed'
          AND DATE(o.created_at) = CURRENT_DATE ${branchCondO} ${shiftCondO}
        GROUP BY oi.item_id
      )
      SELECT 
        COALESCE(SUM((s.total_price - s.total_discount) - (COALESCE(rc.produce_cost_per_unit, 0) * s.total_qty)), 0) as revenue,
        COALESCE(SUM(COALESCE(rc.produce_cost_per_unit, 0) * s.total_qty), 0) as product_cost
      FROM day_items s
      LEFT JOIN recipe_costs rc ON s.item_id = rc.item_id
    `, params);

    // Total fulfilled orders today
    const totalOrdersResult = await pool.query(`
      SELECT COUNT(*) as count FROM orders
      WHERE DATE(created_at) = CURRENT_DATE AND status = 'Completed' ${branchCond} ${shiftCond}
    `, params);

    // Guest Today (Today's total orders excluding cancelled)
    const guestsTodayResult = await pool.query(`
      SELECT COUNT(*) as count FROM orders
      WHERE DATE(created_at) = CURRENT_DATE AND status != 'Cancelled' ${branchCond} ${shiftCond}
    `, params);

    // Last 7 days sales data guaranteed using Postgres generate_series
    const last7DaysQuery = await pool.query(`
      SELECT 
        TO_CHAR(d.date, 'Mon DD') as label,
        COALESCE(SUM(o.grand_total), 0) as total
      FROM (
        SELECT CURRENT_DATE - i as date
        FROM generate_series(6, 0, -1) i
      ) d
      LEFT JOIN orders o 
        ON DATE(o.created_at) = d.date AND o.status = 'Completed' ${branchCondO} ${shiftCondO}
      GROUP BY d.date
      ORDER BY d.date ASC
    `, params);

    const days = last7DaysQuery.rows.map(r => ({
      label: r.label,
      total: parseFloat(r.total)
    }));

    // Top selling items overall
    const topItems = await pool.query(`
      SELECT oi.item_name, SUM(oi.qty) as total_qty
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE 1=1 ${branchCondO} ${shiftCondO}
      GROUP BY oi.item_name
      ORDER BY total_qty DESC
      LIMIT 6
    `, params);

    res.json({
      totalSale: parseFloat(totalSaleResult.rows[0].total_sale),
      dailyRevenue: parseFloat(dailyRevenueResult.rows[0].revenue),
      totalProductCost: parseFloat(dailyRevenueResult.rows[0].product_cost),
      totalOrders: parseInt(totalOrdersResult.rows[0].count),
      guestsToday: parseInt(guestsTodayResult.rows[0].count),
      last7Days: days,
      topItems: topItems.rows.map(r => ({
        name: r.item_name,
        value: parseInt(r.total_qty),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
