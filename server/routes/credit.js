const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
// KSA (UTC+3) Current Month Helper
const getKsaCurrentMonthStr = () => {
  const now = new Date();
  const ksaDate = new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60000);
  const year = ksaDate.getFullYear();
  const month = String(ksaDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};


// Middleware to parse JSON
router.use(express.json());

// Protect all credit routes with authentication
router.use(authenticateToken);

// Role-Based Access Control (RBAC):
// Strictly block Waiter / Order Taker accounts from Khata operations
router.use((req, res, next) => {
  const userRole = req.user?.role?.trim().toLowerCase();
  if (userRole === 'order taker' || userRole === 'waiter') {
    return res.status(403).json({ error: 'Access denied: Waiters cannot access Khata module.' });
  }
  next();
});

// ==========================================
// 1. DISCOUNT PACKAGES MANAGEMENT (ADMIN)
// ==========================================

// Get all discount packages
router.get('/discount-packages', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM discount_packages ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching discount packages:', error);
    res.status(500).json({ error: 'Failed to fetch discount packages' });
  }
});

// Create a new discount package (Admin/Developer only)
router.post('/discount-packages', async (req, res) => {
  const userRole = req.user?.role?.trim().toLowerCase();
  if (userRole !== 'admin' && userRole !== 'developer') {
    return res.status(403).json({ error: 'Only Admins can manage discount packages.' });
  }

  const { name, discount_percentage, discount_rules, is_active } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Package name is required.' });
  }

  try {
    // Check if package name is unique (case-insensitive)
    const existingPkg = await pool.query(
      'SELECT id FROM discount_packages WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))',
      [name.trim()]
    );
    if (existingPkg.rows.length > 0) {
      return res.status(400).json({ error: 'A discount package with this name already exists. Please choose a unique name.' });
    }

    const pct = discount_percentage !== undefined ? parseFloat(discount_percentage) || 0 : 0;
    if (pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'Discount percentage must be between 0 and 100.' });
    }

    const rules = Array.isArray(discount_rules) ? JSON.stringify(discount_rules) : (typeof discount_rules === 'string' ? discount_rules : '[]');

    const result = await pool.query(
      `INSERT INTO discount_packages (name, discount_percentage, discount_rules, is_active, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW()) RETURNING *`,
      [name.trim(), pct, rules, is_active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating discount package:', error);
    res.status(500).json({ error: 'Failed to create discount package.' });
  }
});

// Update an existing discount package (Admin/Developer only)
router.put('/discount-packages/:id', async (req, res) => {
  const userRole = req.user?.role?.trim().toLowerCase();
  if (userRole !== 'admin' && userRole !== 'developer') {
    return res.status(403).json({ error: 'Only Admins can manage discount packages.' });
  }

  const { id } = req.params;
  const { name, discount_percentage, discount_rules, is_active } = req.body;

  try {
    const fields = [];
    const params = [];

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Package name cannot be empty.' });
      }
      // Check unique package name excluding current ID
      const existingPkg = await pool.query(
        'SELECT id FROM discount_packages WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND id != $2',
        [name.trim(), id]
      );
      if (existingPkg.rows.length > 0) {
        return res.status(400).json({ error: 'A discount package with this name already exists. Please choose a unique name.' });
      }
      params.push(name.trim());
      fields.push(`name = $${params.length}`);
    }
    if (discount_percentage !== undefined) {
      const pct = parseFloat(discount_percentage) || 0;
      if (pct < 0 || pct > 100) {
        return res.status(400).json({ error: 'Discount percentage must be between 0 and 100.' });
      }
      params.push(pct);
      fields.push(`discount_percentage = $${params.length}`);
    }
    if (discount_rules !== undefined) {
      const rules = Array.isArray(discount_rules) ? JSON.stringify(discount_rules) : (typeof discount_rules === 'string' ? discount_rules : '[]');
      params.push(rules);
      fields.push(`discount_rules = $${params.length}::jsonb`);
    }
    if (is_active !== undefined) {
      params.push(Boolean(is_active));
      fields.push(`is_active = $${params.length}`);
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const query = `UPDATE discount_packages SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Discount package not found.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating discount package:', error);
    res.status(500).json({ error: 'Failed to update discount package.' });
  }
});

// Delete a discount package (Admin/Developer only)
router.delete('/discount-packages/:id', async (req, res) => {
  const userRole = req.user?.role?.trim().toLowerCase();
  if (userRole !== 'admin' && userRole !== 'developer') {
    return res.status(403).json({ error: 'Only Admins can manage discount packages.' });
  }

  const { id } = req.params;
  try {
    // Set customer references to null before deleting
    await pool.query('UPDATE credit_customers SET discount_package_id = NULL WHERE discount_package_id = $1', [id]);
    const result = await pool.query('DELETE FROM discount_packages WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Discount package not found.' });
    }
    res.json({ message: 'Discount package deleted successfully.' });
  } catch (error) {
    console.error('Error deleting discount package:', error);
    res.status(500).json({ error: 'Failed to delete discount package.' });
  }
});

// Bulk apply or remove a discount package on multiple customers/employees (Admin/Developer only)
router.post('/discount-packages/:id/apply', async (req, res) => {
  const userRole = req.user?.role?.trim().toLowerCase();
  if (userRole !== 'admin' && userRole !== 'developer') {
    return res.status(403).json({ error: 'Only Admins can apply discount packages.' });
  }

  const packageId = parseInt(req.params.id, 10);
  const { customer_ids } = req.body;

  if (!Array.isArray(customer_ids)) {
    return res.status(400).json({ error: 'customer_ids array is required.' });
  }

  const validIds = customer_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Remove this package from any customers who were unchecked (not in validIds)
    if (validIds.length > 0) {
      await client.query(
        'UPDATE credit_customers SET discount_package_id = NULL WHERE discount_package_id = $1 AND NOT (id = ANY($2::int[]))',
        [packageId, validIds]
      );
    } else {
      await client.query(
        'UPDATE credit_customers SET discount_package_id = NULL WHERE discount_package_id = $1',
        [packageId]
      );
    }

    // 2. Assign this package to all selected customers
    if (validIds.length > 0) {
      await client.query(
        'UPDATE credit_customers SET discount_package_id = $1 WHERE id = ANY($2::int[])',
        [packageId, validIds]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, count: validIds.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error applying discount package:', error);
    res.status(500).json({ error: 'Failed to update discount package assignments.' });
  } finally {
    client.release();
  }
});

// ==========================================
// 2. KHATA CUSTOMERS CRUD & ACCESS CONTROL
// ==========================================

// Get available branches from credit_customers, orders, and users
router.get('/branches', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT b FROM (
        SELECT jsonb_array_elements_text(available_branches) AS b FROM credit_customers WHERE available_branches IS NOT NULL AND jsonb_typeof(available_branches) = 'array'
        UNION
        SELECT branch AS b FROM orders WHERE branch IS NOT NULL AND branch != ''
        UNION
        SELECT branch AS b FROM users WHERE branch IS NOT NULL AND branch != ''
      ) sub
      WHERE b IS NOT NULL AND b != ''
      ORDER BY b ASC
    `);
    let branches = result.rows.map(r => r.b);
    if (branches.length === 0) branches = ['Branch 1', 'Branch 2', 'Branch 3'];
    res.json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.json(['Branch 1', 'Branch 2', 'Branch 3']);
  }
});

// Get all credit customers (with category, status, and discount package info)
router.get('/', async (req, res) => {
  const branchFilter = req.query.branch;
  const userRole = req.user?.role?.trim().toLowerCase();
  const userBranch = req.user?.branch;
  const categoryFilter = req.query.category;
  const sortBy = req.query.sortBy;
  const targetMonth = (req.query.month && req.query.month.trim()) ? req.query.month.trim() : getKsaCurrentMonthStr();

  try {
    const isAllMonths = targetMonth === 'All';
    let monthBalanceClause = '';
    let params = [];

    if (isAllMonths) {
      monthBalanceClause = `
        COALESCE((
          SELECT SUM(
            CASE 
              WHEN type IN ('CHARGE', 'CREDIT_ORDER') THEN amount 
              WHEN type = 'PAYMENT' THEN -amount 
              WHEN type = 'ORDER_CANCELLED' THEN -amount
              WHEN type = 'PAYMENT_CANCELLED' THEN amount
              ELSE 0 
            END
          )
          FROM credit_transactions 
          WHERE credit_customer_id = cc.id
        ), 0) AS current_month_balance
      `;
    } else {
      params.push(targetMonth);
      monthBalanceClause = `
        COALESCE((
          SELECT SUM(
            CASE 
              WHEN type IN ('CHARGE', 'CREDIT_ORDER') THEN amount 
              WHEN type = 'PAYMENT' THEN -amount 
              WHEN type = 'ORDER_CANCELLED' THEN -amount
              WHEN type = 'PAYMENT_CANCELLED' THEN amount
              ELSE 0 
            END
          )
          FROM credit_transactions 
          WHERE credit_customer_id = cc.id 
            AND COALESCE(billing_month, TO_CHAR(created_at, 'YYYY-MM')) = $1
        ), 0) AS current_month_balance
      `;
    }

    let query = `
      SELECT 
        cc.*,
        dp.name AS discount_package_name,
        dp.discount_percentage AS discount_package_percentage,
        dp.discount_rules AS discount_package_rules,
        dp.is_active AS discount_package_active,
        emp.name AS registered_employee_name,
        emp.role AS registered_employee_role,
        emp.employee_id AS registered_employee_code,
        ${monthBalanceClause}
      FROM credit_customers cc
      LEFT JOIN discount_packages dp ON cc.discount_package_id = dp.id
      LEFT JOIN employees emp ON cc.employee_id = emp.id
    `;
    let whereClauses = [];

    // Helper to generate branch matching clause (overlap matching across branch name variations)
    const getBranchMatchClause = (branchStr) => {
      const numMatch = (branchStr || '').match(/\d+/);
      const branchNum = numMatch ? numMatch[0] : null;
      if (branchNum) {
        return `(
          cc.available_branches @> '["${branchStr.replace(/'/g, "''")}"]'::jsonb 
          OR cc.available_branches @> '["Branch ${branchNum}"]'::jsonb 
          OR cc.available_branches @> '["Restaurant ${branchNum}"]'::jsonb 
          OR cc.available_branches @> '["B${branchNum}"]'::jsonb
        )`;
      } else {
        params.push(JSON.stringify([branchStr]));
        return `cc.available_branches @> $${params.length}::jsonb`;
      }
    };

    // Branch isolation for non-admin/management
    if (userRole !== 'admin' && userRole !== 'developer' && userRole !== 'management') {
      if (userBranch) {
        const branches = userBranch.split(',').map(s => s.trim());
        whereClauses.push(getBranchMatchClause(branches[0]));
      } else {
        whereClauses.push('1=0');
      }
    } else {
      const effectiveBranch = (branchFilter && branchFilter !== 'All') 
        ? branchFilter 
        : (userRole === 'management' && userBranch && userBranch !== 'All' ? userBranch.split(',')[0].trim() : null);
        
      if (effectiveBranch && effectiveBranch !== 'All') {
        whereClauses.push(getBranchMatchClause(effectiveBranch));
      }
    }

    // Category filter
    if (categoryFilter && categoryFilter !== 'All') {
      params.push(categoryFilter);
      whereClauses.push(`cc.category = $${params.length}`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // Balance Sorting Filter
    if (sortBy === 'highest_balance') {
      query += ' ORDER BY cc.balance DESC, cc.name ASC';
    } else if (sortBy === 'lowest_balance') {
      query += ' ORDER BY cc.balance ASC, cc.name ASC';
    } else {
      query += ' ORDER BY COALESCE((SELECT MAX(created_at) FROM credit_transactions WHERE credit_customer_id = cc.id), cc.created_at) DESC, cc.name ASC';
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching credit customers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a new credit customer
router.post('/', async (req, res) => {
  const userRole = req.user?.role?.trim().toLowerCase();
  if (userRole === 'management') {
    return res.status(403).json({ error: 'Management role has view-only access.' });
  }

  const { 
    name, 
    phone, 
    credit_limit, 
    available_branches, 
    reference, 
    notes, 
    discount_rules,
    status,
    category,
    company_name,
    is_extra_pay,
    discount_package_id,
    employee_id
  } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  const userBranch = req.user?.branch;
  let finalBranches = available_branches || [];
  
  if (userRole !== 'admin' && userRole !== 'developer') {
    finalBranches = userBranch ? [userBranch.split(',')[0].trim()] : [];
  }

  const finalStatus = status === 'Deactivated' ? 'Deactivated' : 'Active';
  const finalCategory = (category === 'Employee' || category === 'Company') ? category : 'Regular Customer';
  
  if (finalCategory === 'Company' && (!company_name || !company_name.trim())) {
    return res.status(400).json({ error: 'Company Name is required for Company customers' });
  }

  const finalCompanyName = finalCategory === 'Company' ? company_name.trim() : null;
  const finalExtraPay = finalCategory === 'Employee' && Boolean(is_extra_pay);
  const finalPkgId = discount_package_id ? parseInt(discount_package_id, 10) : null;
  const finalEmployeeId = finalCategory === 'Employee' && employee_id ? parseInt(employee_id, 10) : null;

  try {
    const checkQuery = `SELECT id, name, phone FROM credit_customers WHERE LOWER(name) = LOWER($1) ${phone ? 'OR phone = $2' : ''}`;
    const checkParams = phone ? [name.trim(), phone.trim()] : [name.trim()];
    const existing = await pool.query(checkQuery, checkParams);
    
    if (existing.rows.length > 0) {
      const match = existing.rows[0];
      if (match.name.toLowerCase() === name.trim().toLowerCase()) {
        return res.status(400).json({ error: 'A customer with this name already exists' });
      } else {
        return res.status(400).json({ error: 'A customer with this phone number already exists' });
      }
    }

    const result = await pool.query(
      `INSERT INTO credit_customers (
        name, phone, credit_limit, balance, available_branches, reference, notes, discount_rules,
        status, category, is_extra_pay, discount_package_id, employee_id, company_name
      ) VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        name.trim(), 
        phone ? phone.trim() : null, 
        credit_limit || 0, 
        JSON.stringify(finalBranches), 
        reference || null, 
        notes || null, 
        JSON.stringify(discount_rules || []),
        finalStatus,
        finalCategory,
        finalExtraPay,
        finalPkgId,
        finalEmployeeId,
        finalCompanyName
      ]
    );

    // Notify admins
    try {
      await pool.query(
        "INSERT INTO notifications (message, type, target_roles) VALUES ($1, 'CREDIT_CUSTOMER', '[\"admin\", \"developer\"]'::jsonb)",
        [`New Credit Customer added: ${name.trim()} (${finalCategory}${finalCompanyName ? ` - ${finalCompanyName}` : ''})`]
      );
    } catch (notifErr) {
      console.error('Failed to create notification:', notifErr);
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding credit customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a credit customer
router.put('/:id', async (req, res) => {
  const userRole = req.user?.role?.trim().toLowerCase();
  if (userRole === 'management') {
    return res.status(403).json({ error: 'Management role has view-only access.' });
  }

  const { id } = req.params;
  const { 
    name, 
    phone, 
    credit_limit, 
    available_branches, 
    reference, 
    notes, 
    discount_rules,
    status,
    category,
    company_name,
    is_extra_pay,
    discount_package_id,
    employee_id
  } = req.body;

  try {
    const checkQuery = `SELECT id, name, phone FROM credit_customers WHERE id != $1 AND (LOWER(name) = LOWER($2) ${phone ? 'OR phone = $3' : ''})`;
    const checkParams = phone ? [id, (name || '').trim(), phone.trim()] : [id, (name || '').trim()];
    const existing = await pool.query(checkQuery, checkParams);
    
    if (existing.rows.length > 0) {
      const match = existing.rows[0];
      if (match.name.toLowerCase() === (name || '').trim().toLowerCase()) {
        return res.status(400).json({ error: 'A customer with this name already exists' });
      } else {
        return res.status(400).json({ error: 'A customer with this phone number already exists' });
      }
    }

    let query = `
      UPDATE credit_customers 
      SET name = $1, phone = $2, credit_limit = $3, reference = $4, notes = $5
    `;
    let params = [
      (name || '').trim(), 
      phone ? phone.trim() : null, 
      credit_limit || 0, 
      reference || null, 
      notes || null
    ];
    
    if (status !== undefined) {
      params.push(status === 'Deactivated' ? 'Deactivated' : 'Active');
      query += `, status = $${params.length}`;
    }

    if (category !== undefined) {
      const cat = (category === 'Employee' || category === 'Company') ? category : 'Regular Customer';
      params.push(cat);
      query += `, category = $${params.length}`;

      if (cat === 'Company') {
        const cName = company_name !== undefined ? (company_name ? company_name.trim() : '') : '';
        params.push(cName || null);
        query += `, company_name = $${params.length}, is_extra_pay = FALSE, employee_id = NULL`;
      } else if (cat === 'Employee') {
        query += `, company_name = NULL`;
        if (is_extra_pay !== undefined) {
          params.push(Boolean(is_extra_pay));
          query += `, is_extra_pay = $${params.length}`;
        }
        if (employee_id !== undefined) {
          const empId = employee_id ? parseInt(employee_id, 10) : null;
          params.push(empId);
          query += `, employee_id = $${params.length}`;
        }
      } else {
        query += `, company_name = NULL, is_extra_pay = FALSE, employee_id = NULL`;
      }
    } else {
      if (company_name !== undefined) {
        params.push(company_name ? company_name.trim() : null);
        query += `, company_name = $${params.length}`;
      }
      if (is_extra_pay !== undefined) {
        params.push(Boolean(is_extra_pay));
        query += `, is_extra_pay = $${params.length}`;
      }
      if (employee_id !== undefined) {
        const empId = employee_id ? parseInt(employee_id, 10) : null;
        params.push(empId);
        query += `, employee_id = $${params.length}`;
      }
    }

    if (discount_package_id !== undefined) {
      const pkgId = discount_package_id ? parseInt(discount_package_id, 10) : null;
      params.push(pkgId);
      query += `, discount_package_id = $${params.length}`;
    }

    if (userRole === 'admin' || userRole === 'developer') {
      if (available_branches !== undefined) {
        params.push(JSON.stringify(available_branches));
        query += `, available_branches = $${params.length}`;
      }
      if (discount_rules !== undefined) {
        params.push(JSON.stringify(discount_rules));
        query += `, discount_rules = $${params.length}`;
      }
    }
    
    params.push(id);
    query += ` WHERE id = $${params.length} RETURNING *`;

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Credit customer not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating credit customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a credit customer (with Deletion Safeguard: balance must be exactly 0)
router.delete('/:id', async (req, res) => {
  const userRole = req.user?.role?.trim().toLowerCase();
  if (userRole !== 'admin' && userRole !== 'developer') {
    return res.status(403).json({ error: 'Only Admins can delete Khata accounts.' });
  }

  const { id } = req.params;
  try {
    const custRes = await pool.query('SELECT name, balance FROM credit_customers WHERE id = $1', [id]);
    if (custRes.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    
    const currentBalance = parseFloat(custRes.rows[0].balance || 0);
    // Deletion Rule: Prevent deletion of any Khata profile whose outstanding balance is greater than zero
    if (Math.abs(currentBalance) > 0.001) {
      return res.status(400).json({ 
        error: `Cannot delete Khata account with an outstanding balance of SAR ${currentBalance.toFixed(2)}. Deletion is only permissible when account balance is exactly zero.` 
      });
    }

    await pool.query('DELETE FROM credit_transactions WHERE credit_customer_id = $1', [id]);
    await pool.query('DELETE FROM credit_customers WHERE id = $1', [id]);
    res.json({ message: 'Customer account deleted successfully' });
  } catch (error) {
    console.error('Error deleting credit customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 3. MONTH-WISE BREAKDOWN & TRANSACTION LEDGER
// ==========================================

// Get Month-Wise Balance Breakdown for a specific Khata account
router.get('/:id/monthly-summary', async (req, res) => {
  const { id } = req.params;
  try {
    const summaryRes = await pool.query(`
      SELECT 
        COALESCE(billing_month, TO_CHAR(created_at, 'YYYY-MM')) AS month,
        COALESCE(billing_month, TO_CHAR(created_at, 'YYYY-MM')) AS billing_month,
        SUM(CASE WHEN type IN ('CHARGE', 'CREDIT_ORDER') THEN amount ELSE 0 END) AS total_debit,
        SUM(CASE WHEN type IN ('CHARGE', 'CREDIT_ORDER') THEN amount ELSE 0 END) AS debit,
        SUM(CASE WHEN type = 'PAYMENT' THEN amount ELSE 0 END) AS total_credit,
        SUM(CASE WHEN type = 'PAYMENT' THEN amount ELSE 0 END) AS credit,
        SUM(CASE 
          WHEN type IN ('CHARGE', 'CREDIT_ORDER') THEN amount 
          WHEN type = 'PAYMENT' THEN -amount 
          WHEN type = 'ORDER_CANCELLED' THEN -amount
          WHEN type = 'PAYMENT_CANCELLED' THEN amount
          ELSE 0 
        END) AS remaining_balance,
        SUM(CASE 
          WHEN type IN ('CHARGE', 'CREDIT_ORDER') THEN amount 
          WHEN type = 'PAYMENT' THEN -amount 
          WHEN type = 'ORDER_CANCELLED' THEN -amount
          WHEN type = 'PAYMENT_CANCELLED' THEN amount
          ELSE 0 
        END) AS net_balance,
        SUM(CASE WHEN classification = 'Extra Pay' AND type IN ('CHARGE', 'CREDIT_ORDER') THEN amount ELSE 0 END) AS extra_pay_debit,
        SUM(CASE WHEN classification = 'Extra Pay' AND type = 'PAYMENT' THEN amount ELSE 0 END) AS extra_pay_credit,
        SUM(CASE 
          WHEN classification = 'Extra Pay' THEN
            CASE 
              WHEN type IN ('CHARGE', 'CREDIT_ORDER') THEN amount 
              WHEN type = 'PAYMENT' THEN -amount 
              WHEN type = 'ORDER_CANCELLED' THEN -amount
              WHEN type = 'PAYMENT_CANCELLED' THEN amount
              ELSE 0 
            END
          ELSE 0 
        END) AS extra_pay_balance,
        COUNT(*) AS transaction_count
      FROM credit_transactions
      WHERE credit_customer_id = $1
      GROUP BY COALESCE(billing_month, TO_CHAR(created_at, 'YYYY-MM'))
      ORDER BY month DESC
    `, [id]);

    res.json(summaryRes.rows);
  } catch (error) {
    console.error('Error fetching monthly summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ledger (transactions) for a customer with optional month, date range & classification filtering
router.get('/:id/ledger', async (req, res) => {
  const { id } = req.params;
  const { month, classification, from_date, to_date, with_meta } = req.query;

  try {
    let query = `
      SELECT 
        ct.*,
        COALESCE(ct.billing_month, TO_CHAR(ct.created_at, 'YYYY-MM')) AS effective_billing_month,
        o.slip_number,
        o.order_type,
        o.status AS order_status,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'item_name', oi.item_name,
              'qty', oi.qty,
              'unit_price', oi.unit_price,
              'description', COALESCE(i.description, '')
            )
          )
          FROM order_items oi
          LEFT JOIN items i ON oi.item_id = i.id
          WHERE oi.order_id = ct.order_id
        ) AS order_items
      FROM credit_transactions ct
      LEFT JOIN orders o ON ct.order_id = o.id
      WHERE ct.credit_customer_id = $1
    `;
    const params = [id];
    let openingBalance = 0;

    // Custom Date Range Filtering
    if (from_date) {
      const fromTimestamp = `${from_date} 00:00:00`;
      
      // Calculate Opening Balance strictly before from_date
      const openBalRes = await pool.query(`
        SELECT COALESCE(SUM(
          CASE 
            WHEN type IN ('CHARGE', 'CREDIT_ORDER') THEN amount 
            WHEN type = 'PAYMENT' THEN -amount 
            WHEN type = 'ORDER_CANCELLED' THEN -amount
            WHEN type = 'PAYMENT_CANCELLED' THEN amount
            ELSE 0 
          END
        ), 0) AS opening_balance
        FROM credit_transactions
        WHERE credit_customer_id = $1 AND created_at < $2
      `, [id, fromTimestamp]);

      openingBalance = parseFloat(openBalRes.rows[0]?.opening_balance || 0);

      params.push(fromTimestamp);
      query += ` AND ct.created_at >= $${params.length}`;

      if (to_date) {
        const toTimestamp = `${to_date} 23:59:59.999`;
        params.push(toTimestamp);
        query += ` AND ct.created_at <= $${params.length}`;
      }
    } else if (month && month !== 'All') {
      params.push(month);
      query += ` AND COALESCE(ct.billing_month, TO_CHAR(ct.created_at, 'YYYY-MM')) = $${params.length}`;

      // Calculate opening balance before this month begins
      const monthStart = `${month}-01 00:00:00`;
      const openBalRes = await pool.query(`
        SELECT COALESCE(SUM(
          CASE 
            WHEN type IN ('CHARGE', 'CREDIT_ORDER') THEN amount 
            WHEN type = 'PAYMENT' THEN -amount 
            WHEN type = 'ORDER_CANCELLED' THEN -amount
            WHEN type = 'PAYMENT_CANCELLED' THEN amount
            ELSE 0 
          END
        ), 0) AS opening_balance
        FROM credit_transactions
        WHERE credit_customer_id = $1 AND created_at < $2
      `, [id, monthStart]);
      openingBalance = parseFloat(openBalRes.rows[0]?.opening_balance || 0);
    }

    if (classification && classification !== 'All') {
      params.push(classification);
      query += ` AND ct.classification = $${params.length}`;
    }

    // Sort chronologically ascending to accurately compute running balance
    query += ' ORDER BY ct.created_at ASC, ct.id ASC';
    const result = await pool.query(query, params);

    let periodDebit = 0;
    let periodCredit = 0;
    let currentRunning = openingBalance;

    const rowsWithRunningBalance = result.rows.map(row => {
      const amt = parseFloat(row.amount || 0);
      if (row.type === 'CHARGE' || row.type === 'CREDIT_ORDER') {
        periodDebit += amt;
        currentRunning += amt;
      } else if (row.type === 'PAYMENT') {
        periodCredit += amt;
        currentRunning -= amt;
      } else if (row.type === 'ORDER_CANCELLED') {
        periodDebit -= amt;
        currentRunning -= amt;
      } else if (row.type === 'PAYMENT_CANCELLED') {
        periodCredit -= amt;
        currentRunning += amt;
      }
      return {
        ...row,
        running_balance: currentRunning
      };
    });

    const closingBalance = currentRunning;

    // Reverse for descending display in table
    rowsWithRunningBalance.reverse();

    if (from_date || with_meta === 'true') {
      res.json({
        transactions: rowsWithRunningBalance,
        opening_balance: openingBalance,
        period_debit: periodDebit,
        period_credit: periodCredit,
        closing_balance: closingBalance
      });
    } else {
      res.json(rowsWithRunningBalance);
    }
  } catch (error) {
    console.error('Error fetching ledger:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get detailed order history for a customer
router.get('/:id/history', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT o.id, o.created_at, o.grand_total, o.slip_number, o.status,
        (SELECT json_agg(json_build_object('name', oi.item_name, 'qty', oi.qty, 'price', oi.unit_price)) 
         FROM order_items oi WHERE oi.order_id = o.id) as items
      FROM "orders" o
      WHERE o.credit_customer_id = $1
      ORDER BY o.created_at DESC
      LIMIT 50
    `, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 4. MONTH-SPECIFIC PAYMENT & CREDIT POSTING
// ==========================================

// Add a payment or credit adjustment with required billing_month and optional comments
router.post('/:id/payment', async (req, res) => {
  const userRole = req.user?.role?.trim().toLowerCase();
  if (userRole === 'management') {
    return res.status(403).json({ error: 'Management role has view-only access.' });
  }

  const { id } = req.params;
  const { 
    amount, 
    action, 
    cashier_name, 
    payment_method, 
    billing_month, 
    comments, 
    classification 
  } = req.body; 
  
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Valid positive amount is required' });
  }

  // Determine current/fallback billing month if not provided
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const targetBillingMonth = (billing_month && billing_month.trim()) ? billing_month.trim() : currentMonth;

  try {
    await pool.query('BEGIN');

    // Retrieve customer details to inherit classification if employee
    const custRes = await pool.query('SELECT name, balance, is_extra_pay, status FROM credit_customers WHERE id = $1 FOR UPDATE', [id]);
    if (custRes.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }
    const customer = custRes.rows[0];

    const transactionType = action === 'CHARGE' ? 'CHARGE' : 'PAYMENT';
    // CHARGE adds to the balance (debt increases), PAYMENT subtracts from balance (debt decreases).
    const balanceChange = transactionType === 'CHARGE' ? numAmount : -numAmount;

    let targetBranch = req.body?.branch || (req.user?.branch ? req.user.branch.split(',')[0].trim() : 'Branch 1');
    if (targetBranch === 'All' || !targetBranch) targetBranch = 'Branch 1';
    const effectiveCashier = cashier_name || req.user?.username || 'Cashier';

    // Set classification: Explicitly passed, or inherit from employee is_extra_pay
    const finalClassification = classification || (customer.is_extra_pay ? 'Extra Pay' : 'Regular');

    await pool.query(
      `INSERT INTO credit_transactions (
        credit_customer_id, type, amount, cashier_name, payment_method, branch, 
        billing_month, comments, classification, is_shift_closed, is_daily_closed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, FALSE)`,
      [
        id, 
        transactionType, 
        numAmount, 
        effectiveCashier, 
        payment_method || 'Cash', 
        targetBranch,
        targetBillingMonth,
        comments ? comments.trim() : null,
        finalClassification
      ]
    );

    const updateResult = await pool.query(
      'UPDATE credit_customers SET balance = balance + $1 WHERE id = $2 RETURNING *',
      [balanceChange, id]
    );

    if (transactionType === 'PAYMENT') {
      try {
        await pool.query(
          "INSERT INTO notifications (message, type, target_roles) VALUES ($1, 'CREDIT_PAYMENT', '[\"admin\"]'::jsonb)",
          [`Payment of SAR ${numAmount.toFixed(2)} (${payment_method || 'Cash'}) allocated to Month ${targetBillingMonth} received from ${customer.name}`]
        );
      } catch (notifErr) {
        console.error('Failed to create payment notification:', notifErr);
      }
    }

    await pool.query('COMMIT');
    res.json(updateResult.rows[0]);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
