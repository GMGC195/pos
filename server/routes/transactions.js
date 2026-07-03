const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// GET transactions with date filter
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    let query = `
      SELECT t.*, o.grand_total, o.subtotal, o.tax, o.status as order_status, o.slip_number, o.is_edited,
             (SELECT string_agg(qty || 'x ' || item_name, ', ') FROM order_items WHERE order_id = o.id) as items
      FROM transactions t
      JOIN orders o ON t.order_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (from) {
      params.push(from);
      query += ` AND t.created_at >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      query += ` AND t.created_at < ($${params.length}::date + INTERVAL '1 day')`;
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET summary (cash vs card totals for date range)
router.get('/summary', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (from) {
      params.push(from);
      whereClause += ` AND created_at >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND created_at < ($${params.length}::date + INTERVAL '1 day')`;
    }

    const result = await pool.query(
      `SELECT 
        payment_method, 
        COUNT(*) as count, 
        SUM(amount) as total 
       FROM transactions 
       ${whereClause}
       GROUP BY payment_method`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
