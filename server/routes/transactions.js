const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// GET transactions with date filter
router.get('/', authenticateToken, async (req, res) => {
  try {
    let { from, to, branch } = req.query;
    const role = req.user?.role?.trim().toLowerCase();
    const isAdminRole = role === 'admin' || role === 'developer' || role === 'management';
    if (!isAdminRole) {
      if (!req.user?.branch || req.user.branch === 'All') {
        return res.json([]);
      }
      branch = req.user.branch;
    }
    let query = `
      SELECT t.*, o.grand_total, o.subtotal, o.tax, o.status as order_status, o.slip_number, o.is_edited, o.branch, o.order_type,
             o.order_taker, o.completed_by, o.completed_at, o.created_at as order_placed_at,
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
      if (role === 'cashier') {
        params.push(req.user.username);
        query += ` AND o.completed_by = $${params.length}`;
      }
    }

    if (!isAdminRole) {
      params.push(req.user.username);
      query += ` AND (t.payment_method != 'Credit' OR (o.completed_by = $${params.length} AND t.created_at >= CURRENT_DATE))`;
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
    const isAdminRole = role === 'admin' || role === 'developer' || role === 'management';
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
      if (role === 'cashier') {
        params.push(req.user.username);
        whereClause += ` AND o.completed_by = $${params.length}`;
      }
    }

    if (!isAdminRole) {
      params.push(req.user.username);
      whereClause += ` AND (t.payment_method != 'Credit' OR (o.completed_by = $${params.length} AND t.created_at >= CURRENT_DATE))`;
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

// GET credit summary (major payments and total credit balance)
router.get('/credit-summary', authenticateToken, async (req, res) => {
  try {
    let { from, to, branch } = req.query;
    const role = req.user?.role?.trim().toLowerCase();
    const isAdminRole = role === 'admin' || role === 'developer' || role === 'management';
    
    // Total pending credit across all customers (branch filtered if needed)
    let totalCreditQuery = 'SELECT SUM(balance) as total_credit FROM credit_customers';
    let totalCreditParams = [];
    if (!isAdminRole && req.user?.branch) {
       totalCreditQuery += " WHERE available_branches @> $1::jsonb";
       totalCreditParams.push(JSON.stringify([req.user.branch.split(',')[0].trim()]));
    } else if (branch && branch !== 'All') {
       totalCreditQuery += " WHERE available_branches @> $1::jsonb";
       totalCreditParams.push(JSON.stringify([branch]));
    }
    const totalCreditResult = await pool.query(totalCreditQuery, totalCreditParams);
    const totalCredit = parseFloat(totalCreditResult.rows[0]?.total_credit || 0);

    // Major payments received in the date range
    let paymentsQuery = `
      SELECT SUM(ct.amount) as major_payments_total,
             SUM(CASE WHEN ct.payment_method = 'Cash' THEN ct.amount ELSE 0 END) as major_payments_cash,
             SUM(CASE WHEN ct.payment_method = 'Card' THEN ct.amount ELSE 0 END) as major_payments_card
      FROM credit_transactions ct
      JOIN credit_customers cc ON ct.credit_customer_id = cc.id
      WHERE ct.type = 'PAYMENT'
    `;
    let paymentsParams = [];
    
    if (from) {
      paymentsParams.push(from);
      paymentsQuery += ` AND ct.created_at >= $${paymentsParams.length}::date`;
    }
    if (to) {
      paymentsParams.push(to);
      paymentsQuery += ` AND ct.created_at < ($${paymentsParams.length}::date + INTERVAL '1 day')`;
    }
    if (!isAdminRole && req.user?.branch) {
      paymentsParams.push(JSON.stringify([req.user.branch.split(',')[0].trim()]));
      paymentsQuery += ` AND cc.available_branches @> $${paymentsParams.length}::jsonb`;
      paymentsParams.push(req.user.username);
      paymentsQuery += ` AND ct.cashier_name = $${paymentsParams.length} AND ct.created_at >= CURRENT_DATE`;
    } else if (branch && branch !== 'All') {
      paymentsParams.push(JSON.stringify([branch]));
      paymentsQuery += ` AND cc.available_branches @> $${paymentsParams.length}::jsonb`;
    }

    const paymentsResult = await pool.query(paymentsQuery, paymentsParams);
    const majorPaymentsTotal = parseFloat(paymentsResult.rows[0]?.major_payments_total || 0);
    const majorPaymentsCash = parseFloat(paymentsResult.rows[0]?.major_payments_cash || 0);
    const majorPaymentsCard = parseFloat(paymentsResult.rows[0]?.major_payments_card || 0);

    // Also fetch the individual major payments for the report table
    let paymentsListQuery = `
      SELECT ct.id, ct.amount, ct.created_at, ct.cashier_name, cc.name as customer_name, ct.payment_method
      FROM credit_transactions ct
      JOIN credit_customers cc ON ct.credit_customer_id = cc.id
      WHERE ct.type = 'PAYMENT'
    `;
    let listParams = [];
    if (from) {
      listParams.push(from);
      paymentsListQuery += ` AND ct.created_at >= $${listParams.length}::date`;
    }
    if (to) {
      listParams.push(to);
      paymentsListQuery += ` AND ct.created_at < ($${listParams.length}::date + INTERVAL '1 day')`;
    }
    if (!isAdminRole && req.user?.branch) {
      listParams.push(JSON.stringify([req.user.branch.split(',')[0].trim()]));
      paymentsListQuery += ` AND cc.available_branches @> $${listParams.length}::jsonb`;
      listParams.push(req.user.username);
      paymentsListQuery += ` AND ct.cashier_name = $${listParams.length} AND ct.created_at >= CURRENT_DATE`;
    } else if (branch && branch !== 'All') {
      listParams.push(JSON.stringify([branch]));
      paymentsListQuery += ` AND cc.available_branches @> $${listParams.length}::jsonb`;
    }
    paymentsListQuery += ' ORDER BY ct.created_at DESC';

    const paymentsListResult = await pool.query(paymentsListQuery, listParams);

    res.json({
      totalCredit,
      majorPaymentsTotal,
      majorPaymentsCash,
      majorPaymentsCard,
      majorPayments: paymentsListResult.rows
    });
  } catch (err) {
    if (err.code === '42703') {
       // Ignore column errors gracefully during migration
       return res.json({ totalCredit: 0, majorPaymentsTotal: 0, majorPayments: [] });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
