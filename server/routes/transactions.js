const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// GET distinct cashiers list for Reports cashier filter
router.get('/cashiers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT name FROM (
        SELECT completed_by as name FROM orders WHERE completed_by IS NOT NULL AND completed_by != ''
        UNION
        SELECT order_taker as name FROM orders WHERE order_taker IS NOT NULL AND order_taker != ''
        UNION
        SELECT cashier_name as name FROM shift_closings WHERE cashier_name IS NOT NULL AND cashier_name != ''
      ) c
      ORDER BY name ASC
    `);
    res.json(result.rows.map(r => r.name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to resolve closing if closing_id is provided
async function getClosingRecord(closingId) {
  if (!closingId || ['All', 'unclosed', 'closed', ''].includes(closingId) || String(closingId).startsWith('live_')) {
    return null;
  }
  const idNum = parseInt(closingId, 10);
  if (isNaN(idNum)) return null;
  const res = await pool.query('SELECT * FROM shift_closings WHERE id = $1', [idNum]);
  return res.rows[0] || null;
}

// GET transactions with date, time, cashier, and closing filters
router.get('/', authenticateToken, async (req, res) => {
  try {
    let { from, to, branch, from_time, to_time, cashier, closing_id } = req.query;
    const role = req.user?.role?.trim().toLowerCase();
    const isAdminRole = role === 'admin' || role === 'developer' || role === 'management';
    if (!isAdminRole) {
      if (!req.user?.branch || req.user.branch === 'All') {
        return res.json([]);
      }
      branch = req.user.branch;
    }
    let query = `
      SELECT t.*, o.grand_total, o.subtotal, o.tax, o.status as order_status, o.slip_number, o.is_edited, o.edit_count, o.edit_reason, o.edit_history, o.branch, o.order_type,
             o.order_taker, o.completed_by, o.completed_at, o.created_at as order_placed_at,
             (SELECT string_agg(qty || 'x ' || item_name, ', ') FROM order_items WHERE order_id = o.id) as items
      FROM transactions t
      JOIN orders o ON t.order_id = o.id
      WHERE 1=1
    `;
    const params = [];

    // For Cashier on Today's / Active Shift Sale: only show orders from their current shift
    if (req.query.unclosed_only === 'true' && role === 'cashier') {
      const activeShiftRes = await pool.query(
        `SELECT * FROM cashier_shifts WHERE cashier_name = $1 AND status = 'Open' ORDER BY id DESC LIMIT 1`,
        [req.user.username]
      );
      const activeShift = activeShiftRes.rows[0];

      if (activeShift) {
        params.push(activeShift.id);
        const shiftIdParam = `$${params.length}`;
        params.push(req.user.username);
        const userParam = `$${params.length}`;
        params.push(activeShift.start_time);
        const startTimeParam = `$${params.length}`;

        query += ` AND (o.shift_id = ${shiftIdParam} OR (o.is_shift_closed = FALSE AND (o.completed_by = ${userParam} OR (o.completed_by IS NULL AND o.order_taker = ${userParam})) AND t.created_at >= ${startTimeParam}))`;
      } else {
        params.push(req.user.username);
        query += ` AND o.is_shift_closed = FALSE AND (o.completed_by = $${params.length} OR (o.completed_by IS NULL AND o.order_taker = $${params.length}))`;
      }

      if (branch && branch !== 'All') {
        params.push(branch);
        query += ` AND o.branch = $${params.length}`;
      }
      params.push(req.user.username);
      query += ` AND (t.payment_method != 'Credit' OR o.completed_by = $${params.length})`;
      query += ' ORDER BY t.created_at DESC';

      const result = await pool.query(query, params);
      return res.json(result.rows);
    }

    // Check if filtering by a specific shift closing record
    const closingRecord = await getClosingRecord(closing_id);
    if (closingRecord) {
      params.push(closingRecord.login_time);
      query += ` AND t.created_at >= $${params.length}`;
      params.push(closingRecord.logout_time || closingRecord.created_at);
      query += ` AND t.created_at <= $${params.length}`;
      params.push(closingRecord.branch);
      query += ` AND o.branch = $${params.length}`;

      if (closingRecord.closing_type === 'Shift' && closingRecord.cashier_name) {
        params.push(closingRecord.cashier_name);
        query += ` AND (o.completed_by = $${params.length} OR (o.completed_by IS NULL AND o.order_taker = $${params.length}))`;
      }
    } else {
      // Date filtering (Saudi Arabia Asia/Riyadh UTC+3)
      if (from) {
        params.push(from);
        query += ` AND t.created_at >= ($${params.length} || ' 00:00:00+03')::timestamptz`;
      }
      if (to) {
        params.push(to);
        query += ` AND t.created_at <= ($${params.length} || ' 23:59:59.999+03')::timestamptz`;
      }

      // Branch filter
      if (branch && branch !== 'All') {
        params.push(branch);
        query += ` AND o.branch = $${params.length}`;
      }

      // Closing type / status filter
      if (closing_id === 'unclosed' || req.query.unclosed_only === 'true') {
        query += ` AND o.is_shift_closed = FALSE`;
      } else if (closing_id === 'closed') {
        query += ` AND o.is_shift_closed = TRUE`;
      } else if (closing_id && typeof closing_id === 'string' && closing_id.startsWith('live_')) {
        const liveUser = closing_id.replace('live_', '');
        params.push(liveUser);
        query += ` AND o.is_shift_closed = FALSE AND (o.completed_by = $${params.length} OR (o.completed_by IS NULL AND o.order_taker = $${params.length}))`;
      }
    }

    // Time filter (hours/minutes in Saudi Arabia timezone)
    if (from_time && to_time) {
      if (from_time <= to_time) {
        params.push(from_time, to_time);
        query += ` AND (t.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${params.length - 1}::time AND (t.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${params.length}::time`;
      } else {
        params.push(from_time, to_time);
        query += ` AND ((t.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${params.length - 1}::time OR (t.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${params.length}::time)`;
      }
    } else if (from_time) {
      params.push(from_time);
      query += ` AND (t.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${params.length}::time`;
    } else if (to_time) {
      params.push(to_time);
      query += ` AND (t.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${params.length}::time`;
    }

    // Cashier filter
    if (cashier && cashier !== 'All') {
      params.push(cashier);
      query += ` AND (o.completed_by = $${params.length} OR (o.completed_by IS NULL AND o.order_taker = $${params.length}))`;
    }

    if (!isAdminRole) {
      params.push(req.user.username);
      query += ` AND (t.payment_method != 'Credit' OR (o.completed_by = $${params.length} AND (t.created_at AT TIME ZONE 'Asia/Riyadh')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date))`;
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET summary (cash vs card totals with date, time, cashier, and closing filters)
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    let { from, to, branch, from_time, to_time, cashier, closing_id } = req.query;
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

    // For Cashier on Today's / Active Shift Sale: only summarize their current shift
    if (req.query.unclosed_only === 'true' && role === 'cashier') {
      const activeShiftRes = await pool.query(
        `SELECT * FROM cashier_shifts WHERE cashier_name = $1 AND status = 'Open' ORDER BY id DESC LIMIT 1`,
        [req.user.username]
      );
      const activeShift = activeShiftRes.rows[0];

      if (activeShift) {
        params.push(activeShift.id);
        const shiftIdParam = `$${params.length}`;
        params.push(req.user.username);
        const userParam = `$${params.length}`;
        params.push(activeShift.start_time);
        const startTimeParam = `$${params.length}`;

        whereClause += ` AND (o.shift_id = ${shiftIdParam} OR (o.is_shift_closed = FALSE AND (o.completed_by = ${userParam} OR (o.completed_by IS NULL AND o.order_taker = ${userParam})) AND t.created_at >= ${startTimeParam}))`;
      } else {
        params.push(req.user.username);
        whereClause += ` AND o.is_shift_closed = FALSE AND (o.completed_by = $${params.length} OR (o.completed_by IS NULL AND o.order_taker = $${params.length}))`;
      }

      if (branch && branch !== 'All') {
        params.push(branch);
        whereClause += ` AND o.branch = $${params.length}`;
      }
      params.push(req.user.username);
      whereClause += ` AND (t.payment_method != 'Credit' OR o.completed_by = $${params.length})`;

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
      return res.json(result.rows);
    }

    // Check if filtering by a specific shift closing record
    const closingRecord = await getClosingRecord(closing_id);
    if (closingRecord) {
      params.push(closingRecord.login_time);
      whereClause += ` AND t.created_at >= $${params.length}`;
      params.push(closingRecord.logout_time || closingRecord.created_at);
      whereClause += ` AND t.created_at <= $${params.length}`;
      params.push(closingRecord.branch);
      whereClause += ` AND o.branch = $${params.length}`;

      if (closingRecord.closing_type === 'Shift' && closingRecord.cashier_name) {
        params.push(closingRecord.cashier_name);
        whereClause += ` AND (o.completed_by = $${params.length} OR (o.completed_by IS NULL AND o.order_taker = $${params.length}))`;
      }
    } else {
      // Date filtering
      if (from) {
        params.push(from);
        whereClause += ` AND t.created_at >= ($${params.length} || ' 00:00:00+03')::timestamptz`;
      }
      if (to) {
        params.push(to);
        whereClause += ` AND t.created_at <= ($${params.length} || ' 23:59:59.999+03')::timestamptz`;
      }

      // Branch filter
      if (branch && branch !== 'All') {
        params.push(branch);
        whereClause += ` AND o.branch = $${params.length}`;
      }

      // Closing filter
      if (closing_id === 'unclosed' || req.query.unclosed_only === 'true') {
        whereClause += ` AND o.is_shift_closed = FALSE`;
      } else if (closing_id === 'closed') {
        whereClause += ` AND o.is_shift_closed = TRUE`;
      } else if (closing_id && typeof closing_id === 'string' && closing_id.startsWith('live_')) {
        const liveUser = closing_id.replace('live_', '');
        params.push(liveUser);
        whereClause += ` AND o.is_shift_closed = FALSE AND (o.completed_by = $${params.length} OR (o.completed_by IS NULL AND o.order_taker = $${params.length}))`;
      }
    }

    // Time filter
    if (from_time && to_time) {
      if (from_time <= to_time) {
        params.push(from_time, to_time);
        whereClause += ` AND (t.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${params.length - 1}::time AND (t.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${params.length}::time`;
      } else {
        params.push(from_time, to_time);
        whereClause += ` AND ((t.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${params.length - 1}::time OR (t.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${params.length}::time)`;
      }
    } else if (from_time) {
      params.push(from_time);
      whereClause += ` AND (t.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${params.length}::time`;
    } else if (to_time) {
      params.push(to_time);
      whereClause += ` AND (t.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${params.length}::time`;
    }

    // Cashier filter
    if (cashier && cashier !== 'All') {
      params.push(cashier);
      whereClause += ` AND (o.completed_by = $${params.length} OR (o.completed_by IS NULL AND o.order_taker = $${params.length}))`;
    }

    if (!isAdminRole) {
      params.push(req.user.username);
      whereClause += ` AND (t.payment_method != 'Credit' OR (o.completed_by = $${params.length} AND (t.created_at AT TIME ZONE 'Asia/Riyadh')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date))`;
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
    let { from, to, branch, from_time, to_time, cashier, closing_id } = req.query;
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

    // Check if cashier has active shift
    let cashierShiftStartTime = null;
    if (role === 'cashier') {
      const activeShiftRes = await pool.query(
        `SELECT * FROM cashier_shifts WHERE cashier_name = $1 AND status = 'Open' ORDER BY id DESC LIMIT 1`,
        [req.user.username]
      );
      if (activeShiftRes.rows.length > 0) {
        cashierShiftStartTime = activeShiftRes.rows[0].start_time;
      }
    }

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

    let paymentsListQuery = `
      SELECT ct.id, ct.amount, ct.created_at, ct.cashier_name, cc.name as customer_name, ct.payment_method
      FROM credit_transactions ct
      JOIN credit_customers cc ON ct.credit_customer_id = cc.id
      WHERE ct.type = 'PAYMENT'
    `;
    let listParams = [];
    
    const isUnclosedOnly = req.query.unclosed_only === 'true' || closing_id === 'unclosed';

    if (role === 'cashier' && cashierShiftStartTime) {
      paymentsParams.push(req.user.username);
      paymentsQuery += ` AND (ct.cashier_name = $${paymentsParams.length} OR ct.cashier_name IS NULL)`;
      paymentsQuery += ` AND ct.is_shift_closed = FALSE`;
      paymentsParams.push(cashierShiftStartTime);
      paymentsQuery += ` AND ct.created_at >= $${paymentsParams.length}`;

      listParams.push(req.user.username);
      paymentsListQuery += ` AND (ct.cashier_name = $${listParams.length} OR ct.cashier_name IS NULL)`;
      paymentsListQuery += ` AND ct.is_shift_closed = FALSE`;
      listParams.push(cashierShiftStartTime);
      paymentsListQuery += ` AND ct.created_at >= $${listParams.length}`;

      if (req.user?.branch) {
        paymentsParams.push(JSON.stringify([req.user.branch.split(',')[0].trim()]));
        paymentsQuery += ` AND cc.available_branches @> $${paymentsParams.length}::jsonb`;

        listParams.push(JSON.stringify([req.user.branch.split(',')[0].trim()]));
        paymentsListQuery += ` AND cc.available_branches @> $${listParams.length}::jsonb`;
      }
    } else {
      const closingRecord = await getClosingRecord(closing_id);
      if (closingRecord) {
        paymentsParams.push(closingRecord.login_time);
        paymentsQuery += ` AND ct.created_at >= $${paymentsParams.length}`;
        paymentsParams.push(closingRecord.logout_time || closingRecord.created_at);
        paymentsQuery += ` AND ct.created_at <= $${paymentsParams.length}`;

        listParams.push(closingRecord.login_time);
        paymentsListQuery += ` AND ct.created_at >= $${listParams.length}`;
        listParams.push(closingRecord.logout_time || closingRecord.created_at);
        paymentsListQuery += ` AND ct.created_at <= $${listParams.length}`;

        if (closingRecord.branch && closingRecord.branch !== 'All') {
          paymentsParams.push(JSON.stringify([closingRecord.branch]));
          paymentsQuery += ` AND (cc.available_branches @> $${paymentsParams.length}::jsonb OR ct.branch = '${closingRecord.branch}' OR ct.branch IS NULL)`;

          listParams.push(JSON.stringify([closingRecord.branch]));
          paymentsListQuery += ` AND (cc.available_branches @> $${listParams.length}::jsonb OR ct.branch = '${closingRecord.branch}' OR ct.branch IS NULL)`;
        }

        if (closingRecord.closing_type === 'Shift' && closingRecord.cashier_name) {
          paymentsParams.push(closingRecord.cashier_name);
          paymentsQuery += ` AND (ct.cashier_name = $${paymentsParams.length} OR ct.cashier_name IS NULL)`;

          listParams.push(closingRecord.cashier_name);
          paymentsListQuery += ` AND (ct.cashier_name = $${listParams.length} OR ct.cashier_name IS NULL)`;
        }
      } else {
        if (isUnclosedOnly) {
          paymentsQuery += ` AND ct.is_shift_closed = FALSE`;
          paymentsListQuery += ` AND ct.is_shift_closed = FALSE`;
        } else if (closing_id === 'closed') {
          paymentsQuery += ` AND ct.is_shift_closed = TRUE`;
          paymentsListQuery += ` AND ct.is_shift_closed = TRUE`;
        } else if (closing_id && typeof closing_id === 'string' && closing_id.startsWith('live_')) {
          const liveUser = closing_id.replace('live_', '');
          paymentsParams.push(liveUser);
          paymentsQuery += ` AND ct.is_shift_closed = FALSE AND (ct.cashier_name = $${paymentsParams.length} OR ct.cashier_name IS NULL)`;
          listParams.push(liveUser);
          paymentsListQuery += ` AND ct.is_shift_closed = FALSE AND (ct.cashier_name = $${listParams.length} OR ct.cashier_name IS NULL)`;
        }

        if (from) {
          paymentsParams.push(from);
          paymentsQuery += ` AND ct.created_at >= ($${paymentsParams.length} || ' 00:00:00+03')::timestamptz`;
          listParams.push(from);
          paymentsListQuery += ` AND ct.created_at >= ($${listParams.length} || ' 00:00:00+03')::timestamptz`;
        }
        if (to) {
          paymentsParams.push(to);
          paymentsQuery += ` AND ct.created_at <= ($${paymentsParams.length} || ' 23:59:59.999+03')::timestamptz`;
          listParams.push(to);
          paymentsListQuery += ` AND ct.created_at <= ($${listParams.length} || ' 23:59:59.999+03')::timestamptz`;
        }

        if (!isAdminRole && req.user?.branch) {
          paymentsParams.push(JSON.stringify([req.user.branch.split(',')[0].trim()]));
          paymentsQuery += ` AND cc.available_branches @> $${paymentsParams.length}::jsonb`;
          paymentsParams.push(req.user.username);
          paymentsQuery += ` AND ct.cashier_name = $${paymentsParams.length}`;

          listParams.push(JSON.stringify([req.user.branch.split(',')[0].trim()]));
          paymentsListQuery += ` AND cc.available_branches @> $${listParams.length}::jsonb`;
          listParams.push(req.user.username);
          paymentsListQuery += ` AND ct.cashier_name = $${listParams.length}`;
        } else if (branch && branch !== 'All') {
          paymentsParams.push(JSON.stringify([branch]));
          paymentsQuery += ` AND cc.available_branches @> $${paymentsParams.length}::jsonb`;

          listParams.push(JSON.stringify([branch]));
          paymentsListQuery += ` AND cc.available_branches @> $${listParams.length}::jsonb`;
        }
      }
    }

    // Time filter for credit payments
    if (from_time && to_time) {
      if (from_time <= to_time) {
        paymentsParams.push(from_time, to_time);
        paymentsQuery += ` AND (ct.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${paymentsParams.length - 1}::time AND (ct.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${paymentsParams.length}::time`;
        listParams.push(from_time, to_time);
        paymentsListQuery += ` AND (ct.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${listParams.length - 1}::time AND (ct.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${listParams.length}::time`;
      } else {
        paymentsParams.push(from_time, to_time);
        paymentsQuery += ` AND ((ct.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${paymentsParams.length - 1}::time OR (ct.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${paymentsParams.length}::time)`;
        listParams.push(from_time, to_time);
        paymentsListQuery += ` AND ((ct.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${listParams.length - 1}::time OR (ct.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${listParams.length}::time)`;
      }
    } else if (from_time) {
      paymentsParams.push(from_time);
      paymentsQuery += ` AND (ct.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${paymentsParams.length}::time`;
      listParams.push(from_time);
      paymentsListQuery += ` AND (ct.created_at AT TIME ZONE 'Asia/Riyadh')::time >= $${listParams.length}::time`;
    } else if (to_time) {
      paymentsParams.push(to_time);
      paymentsQuery += ` AND (ct.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${paymentsParams.length}::time`;
      listParams.push(to_time);
      paymentsListQuery += ` AND (ct.created_at AT TIME ZONE 'Asia/Riyadh')::time <= $${listParams.length}::time`;
    }

    // Cashier filter for credit payments
    if (cashier && cashier !== 'All') {
      paymentsParams.push(cashier);
      paymentsQuery += ` AND (ct.cashier_name = $${paymentsParams.length} OR ct.cashier_name IS NULL)`;

      listParams.push(cashier);
      paymentsListQuery += ` AND (ct.cashier_name = $${listParams.length} OR ct.cashier_name IS NULL)`;
    }

    paymentsListQuery += ' ORDER BY ct.created_at DESC';

    const paymentsResult = await pool.query(paymentsQuery, paymentsParams);
    const majorPaymentsTotal = parseFloat(paymentsResult.rows[0]?.major_payments_total || 0);
    const majorPaymentsCash = parseFloat(paymentsResult.rows[0]?.major_payments_cash || 0);
    const majorPaymentsCard = parseFloat(paymentsResult.rows[0]?.major_payments_card || 0);

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
       return res.json({ totalCredit: 0, majorPaymentsTotal: 0, majorPayments: [] });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
