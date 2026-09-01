const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// GET Sales Item Report
router.get('/sales-items', authenticateToken, isAdmin, async (req, res) => {
  const { from, to, branch } = req.query;
  
  try {
    let branchCond = '';
    const params = [from, to];
    if (branch && branch !== 'All') {
      params.push(branch);
      branchCond = `AND o.branch = $${params.length}`;
    }

    const query = `
      WITH fifo_costs AS (
        SELECT 
          oi.item_id,
          SUM(oiu.quantity_used * oiu.cost_at_time) as total_produce_cost,
          SUM(oi.qty) as total_qty
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN order_item_usage oiu ON oi.id = oiu.order_item_id
        WHERE o.status = 'Completed'
          AND DATE(o.created_at) >= $1 
          AND DATE(o.created_at) <= $2
          ${branchCond}
        GROUP BY oi.item_id
      ),
      item_stats AS (
        SELECT 
          c.name as category_name,
          oi.item_name,
          oi.item_id,
          SUM(oi.qty) as total_qty,
          SUM(oi.qty * oi.unit_price) as total_price,
          SUM(CASE 
            WHEN o.subtotal > 0 THEN (oi.qty * oi.unit_price / o.subtotal) * o.discount 
            ELSE 0 
          END) as total_discount
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN items i ON oi.item_id = i.id
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE o.status = 'Completed'
          AND DATE(o.created_at) >= $1 
          AND DATE(o.created_at) <= $2
          ${branchCond}
        GROUP BY c.name, oi.item_name, oi.item_id
      )
      SELECT 
        s.category_name,
        s.item_name,
        s.total_qty::integer,
        s.total_price::numeric(10,2) as subtotal,
        s.total_discount::numeric(10,2) as discount,
        (s.total_price - s.total_discount)::numeric(10,2) as sale_price,
        COALESCE(fc.total_produce_cost, 0)::numeric(10,2) as produce_cost,
        ((s.total_price - s.total_discount) - COALESCE(fc.total_produce_cost, 0))::numeric(10,2) as revenue
      FROM item_stats s
      LEFT JOIN fifo_costs fc ON s.item_id = fc.item_id
      ORDER BY s.category_name, s.item_name;
    `;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Sales item report failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
