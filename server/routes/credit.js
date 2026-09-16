const express = require('express');
const router = express.Router();
const pool = require('../db');

// Middleware to parse JSON
router.use(express.json());

// Get all credit customers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM credit_customers ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching credit customers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a new credit customer
router.post('/', async (req, res) => {
  const { name, phone, credit_limit } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const result = await pool.query(
      'INSERT INTO credit_customers (name, phone, credit_limit, balance) VALUES ($1, $2, $3, 0) RETURNING *',
      [name, phone || null, credit_limit || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding credit customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a credit customer
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, credit_limit } = req.body;

  try {
    const result = await pool.query(
      'UPDATE credit_customers SET name = $1, phone = $2, credit_limit = $3 WHERE id = $4 RETURNING *',
      [name, phone || null, credit_limit || 0, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (error) {
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

// Add a payment (clear dues or add advance)
router.post('/:id/payment', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body; // Amount paid by customer
  
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid positive amount is required' });
  }

  try {
    await pool.query('BEGIN');

    // Add payment transaction
    await pool.query(
      'INSERT INTO credit_transactions (credit_customer_id, type, amount) VALUES ($1, $2, $3)',
      [id, 'PAYMENT', amount]
    );

    // Update customer balance (subtracting because payment reduces debt)
    // If balance was 100 (debt), payment of 100 makes it 0.
    // If payment of 150, makes it -50 (advance).
    const updateResult = await pool.query(
      'UPDATE credit_customers SET balance = balance - $1 WHERE id = $2 RETURNING *',
      [amount, id]
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
