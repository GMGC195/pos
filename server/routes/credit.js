const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, blockSalaryPayOperator } = require('../middleware/auth');
const { recordActivityLog } = require('./activityLogs');

router.use(blockSalaryPayOperator);
// KSA (UTC+3) Current Month Helper
const getKsaCurrentMonthStr = () => {
  const now = new Date();
  const ksaDate = new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60000);
  const year = ksaDate.getFullYear();
  const month = String(ksaDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Helper to determine the correct payroll allocation month for an employee Khata transaction
async function getEffectivePayrollMonth(poolClient, creditCustomerId, fallbackMonth) {
  const currentMonth = fallbackMonth || getKsaCurrentMonthStr();
  try {
    const custRes = await poolClient.query(
      'SELECT employee_id FROM credit_customers WHERE id = $1',
      [creditCustomerId]
    );
    const empId = custRes.rows[0]?.employee_id;
    if (!empId) {
      return currentMonth;
    }

    const payrollRes = await poolClient.query(
      'SELECT status FROM employee_payroll_records WHERE employee_id = $1 AND month = $2',
      [empId, currentMonth]
    );

    if (payrollRes.rows.length > 0 && payrollRes.rows[0].status === 'Paid') {
      const [yearStr, monthStr] = currentMonth.split('-');
      let y = parseInt(yearStr, 10);
      let m = parseInt(monthStr, 10) + 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      return `${y}-${String(m).padStart(2, '0')}`;
    }

    return currentMonth;
  } catch (err) {
    console.error('Error determining effective payroll month:', err);
    return currentMonth;
  }
}



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
              'description', COALESCE(cat.name, '')
            )
          )
          FROM order_items oi
          LEFT JOIN items i ON oi.item_id = i.id
          LEFT JOIN categories cat ON i.category_id = cat.id
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
  const currentMonth = getKsaCurrentMonthStr(); // 'YYYY-MM'
  const targetBillingMonth = (billing_month && billing_month.trim()) ? billing_month.trim() : currentMonth;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Duplicate submission prevention: check for identical transaction within 4 seconds
    const transactionType = action === 'CHARGE' ? 'CHARGE' : 'PAYMENT';
    const dupCheck = await client.query(
      `SELECT id FROM credit_transactions 
       WHERE credit_customer_id = $1 
         AND type = $2 
         AND amount = $3 
         AND billing_month = $4 
         AND created_at >= NOW() - INTERVAL '4 seconds'`,
      [id, transactionType, numAmount, targetBillingMonth]
    );
    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Duplicate transaction detected. Please wait a moment.', duplicate: true });
    }

    // Retrieve customer details to inherit classification if employee
    const custRes = await client.query(
      'SELECT name, balance, is_extra_pay, status, branch, available_branches FROM credit_customers WHERE id = $1 FOR UPDATE', 
      [id]
    );
    if (custRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }
    const customer = custRes.rows[0];

    // CHARGE adds to the balance (debt increases), PAYMENT subtracts from balance (debt decreases).
    const balanceChange = transactionType === 'CHARGE' ? numAmount : -numAmount;

    let defaultCustBranch = customer.branch;
    if (!defaultCustBranch) {
      if (Array.isArray(customer.available_branches) && customer.available_branches.length > 0) {
        defaultCustBranch = customer.available_branches[0];
      } else if (typeof customer.available_branches === 'string') {
        try {
          const parsed = JSON.parse(customer.available_branches);
          if (Array.isArray(parsed) && parsed.length > 0) defaultCustBranch = parsed[0];
        } catch (e) {}
      }
    }
    if (!defaultCustBranch) defaultCustBranch = 'Branch 1';

    let targetBranch = req.body?.branch || (req.user?.branch ? req.user.branch.split(',')[0].trim() : defaultCustBranch);
    if (targetBranch === 'All' || !targetBranch) targetBranch = defaultCustBranch;
    const effectiveCashier = cashier_name || req.user?.username || 'Cashier';

    // Set classification: Explicitly passed, or inherit from employee is_extra_pay
    const finalClassification = classification || (customer.is_extra_pay ? 'Extra Pay' : 'Regular');

    const txInsertRes = await client.query(
      `INSERT INTO credit_transactions (
        credit_customer_id, type, amount, cashier_name, payment_method, branch, 
        billing_month, comments, classification, is_shift_closed, is_daily_closed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, FALSE) RETURNING *`,
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

    const updateResult = await client.query(
      'UPDATE credit_customers SET balance = balance + $1 WHERE id = $2 RETURNING *',
      [balanceChange, id]
    );

    // Record into centralized activity_logs
    await recordActivityLog(client, {
      module: 'Khata',
      action: transactionType === 'PAYMENT' ? 'Receive Payment' : (finalClassification === 'Extra Pay' ? 'Add Extra Pay' : 'Add Debit'),
      entity_id: id,
      entity_name: customer.name,
      description: `${transactionType === 'PAYMENT' ? 'Payment' : 'Debit'} of SAR ${numAmount.toFixed(2)} (${payment_method || 'Cash'}) allocated to ${targetBillingMonth}`,
      reason: comments ? comments.trim() : null,
      new_data: { 
        amount: numAmount, 
        type: transactionType, 
        billing_month: targetBillingMonth, 
        payment_method: payment_method || 'Cash',
        classification: finalClassification
      },
      performed_by: effectiveCashier,
      branch: targetBranch,
      month: targetBillingMonth
    });

    if (transactionType === 'PAYMENT') {
      try {
        await client.query(
          "INSERT INTO notifications (message, type, target_roles) VALUES ($1, 'CREDIT_PAYMENT', '[\"admin\"]'::jsonb)",
          [`Payment of SAR ${numAmount.toFixed(2)} (${payment_method || 'Cash'}) allocated to Month ${targetBillingMonth} received from ${customer.name}`]
        );
      } catch (notifErr) {
        console.error('Failed to create payment notification:', notifErr);
      }
    }

    await client.query('COMMIT');
    res.json(updateResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing payment:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  } finally {
    client.release();
  }
});


// ==========================================
// 5. KHATA TRANSACTION MODIFICATION & RESET (ADMIN & DEVELOPER ONLY)
// ==========================================

// Helper for admin/developer authorization check
const ensureAdminOrDeveloper = (req, res) => {
  const role = req.user?.role?.trim().toLowerCase();
  if (role !== 'admin' && role !== 'developer') {
    res.status(403).json({ error: 'Access denied: Admin or Developer privileges required.' });
    return false;
  }
  return true;
};

// PUT /api/credit/transactions/:txId - Modify an existing Khata transaction
router.put('/transactions/:txId', async (req, res) => {
  if (!ensureAdminOrDeveloper(req, res)) return;

  const { txId } = req.params;
  const { amount, type, comments, billing_month, classification, payment_method, reason } = req.body;

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount < 0) {
    return res.status(400).json({ error: 'Valid positive amount is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch old transaction
    const oldTxRes = await client.query(
      'SELECT * FROM credit_transactions WHERE id = $1 FOR UPDATE',
      [txId]
    );
    if (oldTxRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    const oldTx = oldTxRes.rows[0];

    // 2. Fetch customer
    const custRes = await client.query(
      'SELECT id, name, balance, employee_id FROM credit_customers WHERE id = $1 FOR UPDATE',
      [oldTx.credit_customer_id]
    );
    if (custRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found.' });
    }
    const customer = custRes.rows[0];

    // 3. Calculate old vs new balance effect
    // Old impact on debt:
    // If CHARGE/CREDIT_ORDER: debt increased by oldAmount
    // If PAYMENT/ORDER_CANCELLED: debt decreased by oldAmount
    const oldAmt = parseFloat(oldTx.amount || 0);
    const oldIsDebt = ['CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED'].includes(oldTx.type);
    const oldImpact = oldIsDebt ? oldAmt : -oldAmt;

    const newType = type || oldTx.type;
    const newIsDebt = ['CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED'].includes(newType);
    const newImpact = newIsDebt ? numAmount : -numAmount;

    const balanceDelta = newImpact - oldImpact;

    // 4. Update the transaction
    const updateTxRes = await client.query(
      `UPDATE credit_transactions SET 
         amount = $1,
         type = $2,
         comments = $3,
         billing_month = $4,
         classification = $5,
         payment_method = $6,
         updated_at = NOW(),
         updated_by = $7
       WHERE id = $8
       RETURNING *`,
      [
        numAmount,
        newType,
        comments !== undefined ? (comments ? comments.trim() : null) : oldTx.comments,
        billing_month !== undefined ? (billing_month ? billing_month.trim() : oldTx.billing_month) : oldTx.billing_month,
        classification !== undefined ? classification : oldTx.classification,
        payment_method !== undefined ? payment_method : oldTx.payment_method,
        req.user?.username || 'Admin',
        txId
      ]
    );

    // 5. Update customer balance
    const updateCustRes = await client.query(
      'UPDATE credit_customers SET balance = balance + $1 WHERE id = $2 RETURNING *',
      [balanceDelta, customer.id]
    );

    // 6. Record append-only audit log
    await client.query(
      `INSERT INTO credit_audit_logs (
         transaction_id, credit_customer_id, action, performed_by, performed_by_role,
         previous_values, new_values, reason, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        txId,
        customer.id,
        'MODIFY_TRANSACTION',
        req.user?.username || 'Admin',
        req.user?.role || 'Admin',
        JSON.stringify(oldTx),
        JSON.stringify(updateTxRes.rows[0]),
        reason ? reason.trim() : 'Admin corrected transaction'
      ]
    );

    // Record in unified activity_logs
    await recordActivityLog(client, {
      module: 'Khata',
      action: 'Modify Khata Transaction',
      entity_id: customer.id,
      entity_name: customer.name,
      description: `Transaction #${txId} modified from ${oldTx.type} SAR ${oldTx.amount} to ${newType} SAR ${numAmount}`,
      reason: reason ? reason.trim() : 'Admin corrected transaction',
      old_data: oldTx,
      new_data: updateTxRes.rows[0],
      performed_by: req.user?.username || 'Admin',
      branch: customer.branch || 'All',
      month: oldTx.billing_month
    });

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Transaction modified successfully.',
      transaction: updateTxRes.rows[0],
      customer: updateCustRes.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error modifying transaction:', err);
    res.status(500).json({ error: 'Failed to modify transaction: ' + err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/credit/transactions/:txId - Void/Delete an incorrect Khata transaction
router.delete('/transactions/:txId', async (req, res) => {
  if (!ensureAdminOrDeveloper(req, res)) return;

  const { txId } = req.params;
  const { reason } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const oldTxRes = await client.query(
      'SELECT * FROM credit_transactions WHERE id = $1 FOR UPDATE',
      [txId]
    );
    if (oldTxRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    const oldTx = oldTxRes.rows[0];

    const custRes = await client.query(
      'SELECT id, name, balance FROM credit_customers WHERE id = $1 FOR UPDATE',
      [oldTx.credit_customer_id]
    );
    const customer = custRes.rows[0];

    const oldAmt = parseFloat(oldTx.amount || 0);
    const oldIsDebt = ['CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED'].includes(oldTx.type);
    const balanceReversal = oldIsDebt ? -oldAmt : oldAmt;

    await client.query('DELETE FROM credit_transactions WHERE id = $1', [txId]);

    const updateCustRes = await client.query(
      'UPDATE credit_customers SET balance = balance + $1 WHERE id = $2 RETURNING *',
      [balanceReversal, customer.id]
    );

    await client.query(
      `INSERT INTO credit_audit_logs (
         transaction_id, credit_customer_id, action, performed_by, performed_by_role,
         previous_values, new_values, reason, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        null,
        customer.id,
        'DELETE_TRANSACTION',
        req.user?.username || 'Admin',
        req.user?.role || 'Admin',
        JSON.stringify(oldTx),
        JSON.stringify({ status: 'DELETED' }),
        reason ? reason.trim() : 'Admin deleted transaction'
      ]
    );

    // Record in unified activity_logs
    await recordActivityLog(client, {
      module: 'Khata',
      action: 'Delete Khata Transaction',
      entity_id: customer.id,
      entity_name: customer.name,
      description: `Transaction #${txId} (${oldTx.type} SAR ${oldAmt}) deleted/voided`,
      reason: reason ? reason.trim() : 'Admin deleted transaction',
      old_data: oldTx,
      new_data: { status: 'DELETED' },
      performed_by: req.user?.username || 'Admin',
      branch: customer.branch || 'All',
      month: oldTx.billing_month
    });

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Transaction deleted and balance reversed successfully.',
      customer: updateCustRes.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting transaction:', err);
    res.status(500).json({ error: 'Failed to delete transaction: ' + err.message });
  } finally {
    client.release();
  }
});

// POST /api/credit/:id/reset-balance - Reset only the selected individual customer's Khata balance to 0.00
router.post('/:id/reset-balance', async (req, res) => {
  if (!ensureAdminOrDeveloper(req, res)) return;

  const { id } = req.params;
  const { reason } = req.body || {};
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A mandatory reason is required to reset a customer balance.' });
  }

  const currentMonth = getKsaCurrentMonthStr();
  const performedBy = req.user?.username || 'Admin';
  const performedRole = req.user?.role || 'Admin';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch and lock only the target customer row
    const custRes = await client.query(
      'SELECT id, name, balance, employee_id, category, branch, available_branches FROM credit_customers WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (custRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const customer = custRes.rows[0];
    const bal = parseFloat(customer.balance || 0);

    if (bal === 0) {
      await client.query('COMMIT');
      return res.json({
        success: true,
        message: `Balance for ${customer.name} is already 0.00. No adjustment needed.`,
        customer
      });
    }

    let defaultCustBranch = customer.branch;
    if (!defaultCustBranch) {
      if (Array.isArray(customer.available_branches) && customer.available_branches.length > 0) {
        defaultCustBranch = customer.available_branches[0];
      } else if (typeof customer.available_branches === 'string') {
        try {
          const parsed = JSON.parse(customer.available_branches);
          if (Array.isArray(parsed) && parsed.length > 0) defaultCustBranch = parsed[0];
        } catch (e) {}
      }
    }
    if (!defaultCustBranch) defaultCustBranch = 'Branch 1';

    // If bal > 0 (customer owes debt): insert a PAYMENT of bal to zero it out
    // If bal < 0 (customer has advance): insert a CHARGE of abs(bal) to zero it out
    const txType = bal > 0 ? 'PAYMENT' : 'CHARGE';
    const txAmount = Math.abs(bal);

    const txRes = await client.query(
      `INSERT INTO credit_transactions (
         credit_customer_id, type, amount, cashier_name, payment_method, branch,
         billing_month, comments, classification, is_shift_closed, is_daily_closed, created_at
       ) VALUES ($1, $2, $3, $4, 'Balance Reset', $5, $6, $7, 'Balance Reset', FALSE, FALSE, NOW())
       RETURNING *`,
      [
        customer.id,
        txType,
        txAmount,
        performedBy,
        defaultCustBranch,
        currentMonth,
        `Individual Balance Reset to 0.00: ${reason.trim()} (by ${performedBy})`
      ]
    );

    const updatedCustRes = await client.query(
      'UPDATE credit_customers SET balance = 0 WHERE id = $1 RETURNING *',
      [customer.id]
    );

    // Record in credit_audit_logs
    await client.query(
      `INSERT INTO credit_audit_logs (
         transaction_id, credit_customer_id, action, performed_by, performed_by_role,
         previous_values, new_values, reason, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        txRes.rows[0].id,
        customer.id,
        'RESET_USER_BALANCE',
        performedBy,
        performedRole,
        JSON.stringify({ previous_balance: bal, reset_type: txType, reset_amount: txAmount }),
        JSON.stringify({ new_balance: 0 }),
        reason.trim()
      ]
    );

    // Record in unified activity_logs
    await recordActivityLog(client, {
      module: 'Khata',
      action: 'Reset Balance',
      entity_id: customer.id,
      entity_name: customer.name,
      description: `Khata balance for ${customer.name} reset from SAR ${bal.toFixed(2)} to 0.00`,
      reason: reason.trim(),
      old_data: { balance: bal },
      new_data: { balance: 0, transaction_id: txRes.rows[0].id },
      performed_by: performedBy,
      branch: customer.branch || 'All',
      month: currentMonth
    });

    await client.query('COMMIT');
    res.json({
      success: true,
      message: `Balance for ${customer.name} has been reset to 0.00 successfully.`,
      customer: updatedCustRes.rows[0],
      transaction: txRes.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error resetting individual customer balance:', err);
    res.status(500).json({ error: 'Failed to reset customer balance: ' + err.message });
  } finally {
    client.release();
  }
});

// Deprecated global reset endpoint - disabled for security & data safety
router.post('/reset-all-balances', async (req, res) => {
  return res.status(403).json({
    error: 'Global balance reset has been disabled. Please reset balances per individual user from customer details.'
  });
});

// GET /api/credit/audit-logs - View audit logs (Admin & Developer only)
router.get('/audit-logs', async (req, res) => {
  if (!ensureAdminOrDeveloper(req, res)) return;

  const { customer_id, limit = 100 } = req.query;
  try {
    let query = `
      SELECT cal.*, cc.name as customer_name 
      FROM credit_audit_logs cal
      LEFT JOIN credit_customers cc ON cal.credit_customer_id = cc.id
      WHERE 1=1
    `;
    const params = [];
    if (customer_id) {
      params.push(customer_id);
      query += ` AND cal.credit_customer_id = ${params.length}`;
    }
    query += ` ORDER BY cal.created_at DESC LIMIT ${params.length + 1}`;
    params.push(parseInt(limit, 10) || 100);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching credit audit logs:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
