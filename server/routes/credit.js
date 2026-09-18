const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Middleware to parse JSON
router.use(express.json());

// Protect all credit routes
router.use(authenticateToken);

// Get all credit customers
router.get('/', async (req, res) => {
  const branchFilter = req.query.branch;
  const userRole = req.user?.role?.trim().toLowerCase();
  const userBranch = req.user?.branch;

  try {
    let query = 'SELECT * FROM credit_customers';
    let params = [];
    
    // If not admin, they only see their own branch's customers
    if (userRole !== 'admin' && userRole !== 'developer') {
      if (userBranch) {
        query += " WHERE available_branches @> $1::jsonb";
        // Convert comma-separated string to an array or just check if any match
        // Assuming userBranch is a single string for cashiers, or we check against the first branch
        const branches = userBranch.split(',').map(s => s.trim());
        params.push(JSON.stringify([branches[0]]));
      } else {
        // If cashier has no branch, they see nothing or everything? Let's say nothing.
        query += " WHERE 1=0";
      }
    } else {
      // If Admin and provided a specific branch filter (not 'All')
      if (branchFilter && branchFilter !== 'All') {
        query += " WHERE available_branches @> $1::jsonb";
        params.push(JSON.stringify([branchFilter]));
      }
    }

    query += ' ORDER BY name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    if (error.code === '42703') { // undefined_column
      try {
        await pool.query("ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS available_branches JSONB DEFAULT '[]'::jsonb");
        await pool.query("ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS reference VARCHAR(255)");
        await pool.query("ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS notes TEXT");
        await pool.query("ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS cashier_name VARCHAR(100)");
        
        const result = await pool.query(query, params); // retry
        return res.json(result.rows);
      } catch (retryErr) {
        console.error('Auto-migration failed:', retryErr);
      }
    }
    console.error('Error fetching credit customers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a new credit customer
router.post('/', async (req, res) => {
  const { name, phone, credit_limit, available_branches, reference, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const userRole = req.user?.role?.trim().toLowerCase();
  const userBranch = req.user?.branch;

  let finalBranches = available_branches || [];
  
  if (userRole !== 'admin' && userRole !== 'developer') {
    finalBranches = userBranch ? [userBranch.split(',')[0].trim()] : [];
  }

  try {
    const checkQuery = `SELECT * FROM credit_customers WHERE LOWER(name) = LOWER($1) ${phone ? 'OR phone = $2' : ''}`;
    const checkParams = phone ? [name, phone] : [name];
    const existing = await pool.query(checkQuery, checkParams);
    
    if (existing.rows.length > 0) {
      const match = existing.rows[0];
      if (match.name.toLowerCase() === name.toLowerCase()) {
        return res.status(400).json({ error: 'A customer with this name already exists' });
      } else {
        return res.status(400).json({ error: 'A customer with this phone number already exists' });
      }
    }

    const result = await pool.query(
      'INSERT INTO credit_customers (name, phone, credit_limit, balance, available_branches, reference, notes) VALUES ($1, $2, $3, 0, $4, $5, $6) RETURNING *',
      [name, phone || null, credit_limit || 0, JSON.stringify(finalBranches), reference || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '42703') {
      try {
        await pool.query("ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS available_branches JSONB DEFAULT '[]'::jsonb");
        await pool.query("ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS reference VARCHAR(255)");
        await pool.query("ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS notes TEXT");
        await pool.query("ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS cashier_name VARCHAR(100)");

        const result = await pool.query(
          'INSERT INTO credit_customers (name, phone, credit_limit, balance, available_branches, reference, notes) VALUES ($1, $2, $3, 0, $4, $5, $6) RETURNING *',
          [name, phone || null, credit_limit || 0, JSON.stringify(finalBranches), reference || null, notes || null]
        );
        return res.status(201).json(result.rows[0]);
      } catch (retryErr) {
        console.error('Auto-migration failed on POST:', retryErr);
      }
    }
    console.error('Error adding credit customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a credit customer
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, credit_limit, available_branches, reference, notes } = req.body;

  const userRole = req.user?.role?.trim().toLowerCase();
  const userBranch = req.user?.branch;

  try {
    const checkQuery = `SELECT * FROM credit_customers WHERE id != $1 AND (LOWER(name) = LOWER($2) ${phone ? 'OR phone = $3' : ''})`;
    const checkParams = phone ? [id, name, phone] : [id, name];
    const existing = await pool.query(checkQuery, checkParams);
    
    if (existing.rows.length > 0) {
      const match = existing.rows[0];
      if (match.name.toLowerCase() === name.toLowerCase()) {
        return res.status(400).json({ error: 'A customer with this name already exists' });
      } else {
        return res.status(400).json({ error: 'A customer with this phone number already exists' });
      }
    }

    // If not admin, we shouldn't change the branches, or we just keep what's there
    let query = 'UPDATE credit_customers SET name = $1, phone = $2, credit_limit = $3, reference = $4, notes = $5';
    let params = [name, phone || null, credit_limit || 0, reference || null, notes || null];
    
    if (userRole === 'admin' || userRole === 'developer') {
       if (available_branches) {
         params.push(JSON.stringify(available_branches));
         query += `, available_branches = $${params.length}`;
       }
    }
    
    params.push(id);
    query += ` WHERE id = $${params.length} RETURNING *`;

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Credit customer not found' });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '42703') {
      try {
        await pool.query("ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS available_branches JSONB DEFAULT '[]'::jsonb");
        await pool.query("ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS reference VARCHAR(255)");
        await pool.query("ALTER TABLE credit_customers ADD COLUMN IF NOT EXISTS notes TEXT");
        await pool.query("ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS cashier_name VARCHAR(100)");

        const result = await pool.query(query, params); // retry
        if (result.rows.length === 0) return res.status(404).json({ error: 'Credit customer not found' });
        return res.json(result.rows[0]);
      } catch (retryErr) {
        console.error('Auto-migration failed on PUT:', retryErr);
      }
    }
    console.error('Error updating credit customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a credit customer
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM credit_customers WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting credit customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ledger (transactions) for a customer
router.get('/:id/ledger', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM credit_transactions WHERE credit_customer_id = $1 ORDER BY created_at DESC',
      [id]
    );
    res.json(result.rows);
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
      SELECT o.id, o.created_at, o.grand_total, o.slip_number,
        (SELECT json_agg(json_build_object('name', oi.item_name, 'qty', oi.qty)) 
         FROM order_items oi WHERE oi.order_id = o.id) as items
      FROM orders o
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

// Add a payment (clear dues or add advance)
router.post('/:id/payment', async (req, res) => {
  const { id } = req.params;
  const { amount, action, cashier_name } = req.body; 
  
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid positive amount is required' });
  }

  try {
    await pool.query('BEGIN');

    const transactionType = action === 'CHARGE' ? 'CHARGE' : 'PAYMENT';
    // CHARGE adds to the balance (debt increases), PAYMENT subtracts from balance (debt decreases).
    const balanceChange = transactionType === 'CHARGE' ? amount : -amount;

    await pool.query(
      'INSERT INTO credit_transactions (credit_customer_id, type, amount, cashier_name) VALUES ($1, $2, $3, $4)',
      [id, transactionType, amount, cashier_name || req.user?.username || 'Unknown']
    );

    const updateResult = await pool.query(
      'UPDATE credit_customers SET balance = balance + $1 WHERE id = $2 RETURNING *',
      [balanceChange, id]
    );

    if (updateResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
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
