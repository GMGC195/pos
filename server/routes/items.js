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
  const { category_id, name, price, image_url, size_options, status } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO items (category_id, name, price, image_url, size_options, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [category_id, name, price, image_url || '', size_options || [], status || 'Active']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update item
router.put('/:id', authenticateToken, async (req, res) => {
  const { category_id, name, price, image_url, size_options, status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE items SET category_id=$1, name=$2, price=$3, image_url=$4, size_options=$5, status=$6
       WHERE id=$7 RETURNING *`,
      [category_id, name, price, image_url || '', size_options || [], status || 'Active', req.params.id]
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
