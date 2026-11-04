const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

/**
 * Helper to record an entry into the activity_logs table
 */
async function recordActivityLog(dbClientOrPool, {
  module,
  action,
  entity_id = null,
  entity_name = null,
  description = null,
  reason = null,
  old_data = null,
  new_data = null,
  performed_by = 'System',
  branch = 'All',
  month = null
}) {
  try {
    const query = `
      INSERT INTO activity_logs (
        module, action, entity_id, entity_name, description, reason,
        old_data, new_data, performed_by, branch, month, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *
    `;
    const res = await dbClientOrPool.query(query, [
      module,
      action,
      entity_id ? String(entity_id) : null,
      entity_name ? String(entity_name) : null,
      description,
      reason,
      old_data ? (typeof old_data === 'object' ? JSON.stringify(old_data) : old_data) : null,
      new_data ? (typeof new_data === 'object' ? JSON.stringify(new_data) : new_data) : null,
      performed_by,
      branch || 'All',
      month || null
    ]);
    return res.rows[0];
  } catch (err) {
    console.error('Failed to record activity log:', err.message);
    return null;
  }
}

/**
 * GET /api/logs
 * Unified Activity Logs across All Modules (Salary, Khata, Orders)
 * Query parameters:
 *   - category: 'all' | 'Salary' | 'Khata' | 'Orders'
 *   - action: optional action filter string
 *   - month: 'YYYY-MM' or 'all'
 *   - search: query string (search in entity_name, description, reason, performed_by)
 *   - limit: maximum rows to return (default 250)
 */
router.get('/', authenticateToken, async (req, res) => {
  const {
    category = 'all',
    action = '',
    month = '',
    search = '',
    limit = 250
  } = req.query;

  try {
    // We construct a UNION query that gathers:
    // 1. Explicit activity_logs entries
    // 2. Khata audit logs from credit_audit_logs
    // 3. Salary audit logs from salary_audit_logs
    // 4. Salary payments from employee_payroll_payments
    // 5. Order cancellation/return logs from orders table

    let unionParts = [];

    // Part 1: activity_logs table
    unionParts.push(`
      SELECT 
        'act_' || id::text AS log_id,
        module,
        action,
        entity_id,
        entity_name,
        description,
        reason,
        old_data,
        new_data,
        performed_by,
        branch,
        month,
        created_at
      FROM activity_logs
    `);

    // Part 2: credit_audit_logs (Khata)
    unionParts.push(`
      SELECT 
        'cal_' || cal.id::text AS log_id,
        'Khata' AS module,
        cal.action,
        cal.credit_customer_id::text AS entity_id,
        COALESCE(cc.name, 'Customer #' || cal.credit_customer_id) AS entity_name,
        COALESCE(cal.reason, 'Khata record updated') AS description,
        cal.reason,
        cal.previous_values AS old_data,
        cal.new_values AS new_data,
        cal.performed_by,
        COALESCE(cc.branch, 'All') AS branch,
        TO_CHAR(cal.created_at, 'YYYY-MM') AS month,
        cal.created_at
      FROM credit_audit_logs cal
      LEFT JOIN credit_customers cc ON cal.credit_customer_id = cc.id
    `);

    // Part 3: salary_audit_logs (Salary)
    unionParts.push(`
      SELECT 
        'sal_' || sal.id::text AS log_id,
        'Salary' AS module,
        sal.action,
        sal.employee_id::text AS entity_id,
        COALESCE(sal.employee_name, 'Employee #' || sal.employee_id) AS entity_name,
        COALESCE(sal.description, sal.action) AS description,
        sal.description AS reason,
        CASE WHEN sal.previous_value IS NOT NULL THEN jsonb_build_object('value', sal.previous_value) ELSE NULL END AS old_data,
        jsonb_build_object('value', sal.new_value, 'amount', sal.amount) AS new_data,
        sal.performed_by,
        'All' AS branch,
        sal.month,
        sal.created_at
      FROM salary_audit_logs sal
    `);

    // Part 4: employee_payroll_payments (Salary)
    unionParts.push(`
      SELECT 
        'pay_' || pay.id::text AS log_id,
        'Salary' AS module,
        'Salary Payment' AS action,
        pay.employee_id::text AS entity_id,
        COALESCE(e.name, 'Employee #' || pay.employee_id) AS entity_name,
        'Payment of SAR ' || pay.amount || ' via ' || pay.payment_method || ' (Ref: ' || COALESCE(pay.reference, '-') || ')' AS description,
        pay.reference AS reason,
        NULL::jsonb AS old_data,
        jsonb_build_object('amount', pay.amount, 'payment_method', pay.payment_method, 'reference', pay.reference) AS new_data,
        pay.paid_by AS performed_by,
        COALESCE(e.branch, 'All') AS branch,
        pay.month,
        pay.created_at
      FROM employee_payroll_payments pay
      LEFT JOIN employees e ON pay.employee_id = e.id
    `);

    // Part 5: orders (Cancelled or Returned)
    unionParts.push(`
      SELECT 
        'ord_' || o.id::text AS log_id,
        'Orders' AS module,
        'Order ' || o.status AS action,
        o.id::text AS entity_id,
        'Slip #' || COALESCE(o.slip_number::text, o.id::text) AS entity_name,
        'Order #' || COALESCE(o.slip_number::text, o.id::text) || ' (' || COALESCE(o.order_type, 'Dine In') || ', SAR ' || o.grand_total || ') marked as ' || o.status AS description,
        o.cancel_reason AS reason,
        NULL::jsonb AS old_data,
        jsonb_build_object('grand_total', o.grand_total, 'order_type', o.order_type, 'status', o.status, 'customer_name', o.customer_name) AS new_data,
        COALESCE(o.completed_by, o.order_taker, 'System') AS performed_by,
        COALESCE(o.branch, 'All') AS branch,
        TO_CHAR(o.created_at, 'YYYY-MM') AS month,
        o.created_at
      FROM "orders" o
      WHERE o.status IN ('Cancelled', 'Returned')
    `);

    const fullUnion = unionParts.join(' UNION ALL ');

    let query = `
      SELECT * FROM (${fullUnion}) combined_logs
      WHERE 1=1
    `;
    const params = [];

    // Filter by category / module
    if (category && category.toLowerCase() !== 'all') {
      params.push(category);
      query += ` AND LOWER(module) = LOWER($${params.length})`;
    }

    // Filter by action
    if (action && action.trim() !== '' && action.toLowerCase() !== 'all') {
      params.push(`%${action.trim().toLowerCase()}%`);
      query += ` AND LOWER(action) LIKE $${params.length}`;
    }

    // Filter by month
    if (month && month.trim() !== '' && month.toLowerCase() !== 'all') {
      params.push(month.trim());
      query += ` AND month = $${params.length}`;
    }

    // Search query
    if (search && search.trim() !== '') {
      params.push(`%${search.trim().toLowerCase()}%`);
      const pIdx = params.length;
      query += ` AND (
        LOWER(entity_name) LIKE $${pIdx} OR 
        LOWER(description) LIKE $${pIdx} OR 
        LOWER(COALESCE(reason, '')) LIKE $${pIdx} OR 
        LOWER(performed_by) LIKE $${pIdx} OR
        LOWER(action) LIKE $${pIdx} OR
        LOWER(entity_id) LIKE $${pIdx}
      )`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(Math.min(parseInt(limit, 10) || 250, 1000));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching activity logs:', err);
    res.status(500).json({ error: 'Failed to fetch activity logs', details: err.message });
  }
});

/**
 * POST /api/logs
 * Manual entry creation for authorized actions
 */
router.post('/', authenticateToken, async (req, res) => {
  const { module, action, entity_id, entity_name, description, reason, old_data, new_data, branch, month } = req.body;
  if (!module || !action) {
    return res.status(400).json({ error: 'module and action are required' });
  }

  const performed_by = req.user?.username || 'Admin';
  const entry = await recordActivityLog(pool, {
    module,
    action,
    entity_id,
    entity_name,
    description,
    reason,
    old_data,
    new_data,
    performed_by,
    branch,
    month
  });

  if (!entry) {
    return res.status(500).json({ error: 'Failed to record log entry' });
  }
  res.status(201).json(entry);
});

module.exports = {
  router,
  recordActivityLog
};

