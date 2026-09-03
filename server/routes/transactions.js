const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// GET transactions with date filter
router.get('/', authenticateToken, async (req, res) => {
  try {
    let { from, to, branch } = req.query;
    const role = req.user?.role?.trim().toLowerCase();
    const isAdminRole = role === 'admin' || role === 'developer';
    if (!isAdminRole) {
      if (!req.user?.branch || req.user.branch === 'All') {
        return res.json([]);
      }
      branch = req.user.branch;
    }
    let query = `
      SELECT t.*, o.grand_total, o.subtotal, o.tax, o.status as order_status, o.slip_number, o.is_edited, o.branch, o.order_type,
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
    if (branch && branch !== 'All') {
      params.push(branch);
      query += ` AND o.branch = $${params.length}`;
    }
    if (req.query.unclosed_only === 'true') {
      query += ` AND o.is_shift_closed = FALSE AND o.is_daily_closed = FALSE`;
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET summary (cash vs card totals for date range)
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    let { from, to, branch } = req.query;
    const role = req.user?.role?.trim().toLowerCase();
    const isAdminRole = role === 'admin' || role === 'developer';
    if (!isAdminRole) {
      if (!req.user?.branch || req.user.branch === 'All') {
        return res.json([]);
      }
      branch = req.user.branch;
    }
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (from) {
      params.push(from);
      whereClause += ` AND t.created_at >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND t.created_at < ($${params.length}::date + INTERVAL '1 day')`;
    }
    if (branch && branch !== 'All') {
      params.push(branch);
      whereClause += ` AND o.branch = $${params.length}`;
    }
    if (req.query.unclosed_only === 'true') {
      whereClause += ` AND o.is_shift_closed = FALSE AND o.is_daily_closed = FALSE`;
    }

    const result = await pool.query(
      `SELECT 
        t.payment_method, 
        COUNT(*) as count, 
        SUM(t.amount) as total 
       FROM transactions t
       JOIN orders o ON t.order_id = o.id
       ${whereClause}
       GROUP BY t.payment_method`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
