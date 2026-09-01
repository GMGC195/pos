const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET all items with category name
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = `
      SELECT i.*, c.name as category_name 
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    // Branch isolation for Order Taker / Operator
    if (['order taker', 'operator', 'cashier'].includes(req.user.role?.trim().toLowerCase())) {
      params.push(req.user.branch);
      query += ` AND i.available_branches ? $${params.length}`;
    } else if (req.query.branch && req.query.branch !== 'All') {
      params.push(req.query.branch);
      query += ` AND i.available_branches ? $${params.length}`;
    }

    if (category && category !== 'All') {
      params.push(category);
      query += ` AND c.name = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND i.name ILIKE $${params.length}`;
    }

    query += ' ORDER BY i.id';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single item
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT i.*, c.name as category_name FROM items i LEFT JOIN categories c ON i.category_id = c.id WHERE i.id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create item
router.post('/', authenticateToken, async (req, res) => {
  const { category_id, name, price, image_url, size_options, status, short_code } = req.body;
  try {
    let available_branches = ['Branch 1', 'Branch 2', 'Branch 3'];
    if (['order taker', 'operator', 'cashier'].includes(req.user.role?.trim().toLowerCase())) {
      available_branches = [req.user.branch];
    }

    const result = await pool.query(
      `INSERT INTO items (category_id, name, price, image_url, size_options, status, available_branches, short_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [category_id, name, price, image_url || '', size_options || [], status || 'Active', JSON.stringify(available_branches), short_code || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update item
router.put('/:id', authenticateToken, async (req, res) => {
  const { category_id, name, price, image_url, size_options, status, short_code } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch current item
    const currentItemRes = await client.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (currentItemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }
    const currentItem = currentItemRes.rows[0];

    const isRestrictedRole = ['order taker', 'operator', 'cashier'].includes(req.user.role?.trim().toLowerCase());
    const userBranch = req.user.branch;
    let availableBranches = currentItem.available_branches || [];

    // If it's a restricted user and the item is shared with other branches
    if (isRestrictedRole && availableBranches.length > 1 && availableBranches.includes(userBranch)) {
      // Remove this branch from the original item
      const newOriginalBranches = availableBranches.filter(b => b !== userBranch);
      await client.query('UPDATE items SET available_branches = $1 WHERE id = $2', [JSON.stringify(newOriginalBranches), req.params.id]);

      // Create a new item for this branch with the updated details
      const createResult = await client.query(
        `INSERT INTO items (category_id, name, price, image_url, size_options, status, available_branches, short_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [category_id, name, price, image_url || '', size_options || [], status || 'Active', JSON.stringify([userBranch]), short_code || '']
      );
      
      const newItem = createResult.rows[0];

      // Copy recipes from old item to new item
      const recipesRes = await client.query('SELECT * FROM recipes WHERE item_id = $1', [req.params.id]);
      for (const recipe of recipesRes.rows) {
        await client.query(
          'INSERT INTO recipes (item_id, stock_id, quantity_used, size_label) VALUES ($1, $2, $3, $4)',
          [newItem.id, recipe.stock_id, recipe.quantity_used, recipe.size_label]
        );
      }

      await client.query('COMMIT');
      return res.json(newItem);
    } else {
      // Normal update
      const result = await client.query(
        `UPDATE items SET category_id=$1, name=$2, price=$3, image_url=$4, size_options=$5, status=$6, short_code=$7
         WHERE id=$8 RETURNING *`,
        [category_id, name, price, image_url || '', size_options || [], status || 'Active', short_code || '', req.params.id]
      );
      await client.query('COMMIT');
      res.json(result.rows[0]);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH update available branches
router.patch('/:id/branches', authenticateToken, async (req, res) => {
  const { available_branches } = req.body;
  try {
    const result = await pool.query(
      'UPDATE items SET available_branches = $1 WHERE id = $2 RETURNING *',
      [JSON.stringify(available_branches), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE item
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM items WHERE id = $1', [req.params.id]);
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Item is mapped to past orders/recipes. Please set status to "Inactive" instead.' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
