const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get all tables (filtered by branch if operator)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user.role?.toLowerCase() || '';
    const userBranch = req.user.branch;
    
    let query = 'SELECT * FROM tables WHERE status = $1';
    let params = ['Active'];

    const isAdmin = userRole === 'admin' || userRole === 'developer';
    // If restricted role and has a branch, filter tables available in that branch
    if (!isAdmin && userBranch) {
      params.push(`%"${userBranch}"%`);
      query += ` AND available_branches::text LIKE $${params.length}`;
    } else if (req.query.branch && req.query.branch !== 'All') {
      params.push(`%"${req.query.branch}"%`);
      query += ` AND available_branches::text LIKE $${params.length}`;
    }

    query += " ORDER BY COALESCE(sort_order, 0) ASC, id ASC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching tables:', err);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Admin: Get all tables without branch filter (for Manage Tables Modal)
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tables ORDER BY COALESCE(sort_order, 0) ASC, id ASC");
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching all tables:', err);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Reorder tables (for drag and drop sorting)
router.put('/reorder', authenticateToken, async (req, res) => {
  const { tableIds } = req.body;
  if (!Array.isArray(tableIds) || tableIds.length === 0) {
    return res.status(400).json({ error: 'tableIds array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < tableIds.length; i++) {
      const id = typeof tableIds[i] === 'object' ? tableIds[i].id : tableIds[i];
      await client.query('UPDATE tables SET sort_order = $1 WHERE id = $2', [i + 1, id]);
    }
    await client.query('COMMIT');

    if (req.io) {
      req.io.emit('tables-updated');
    }

    res.json({ success: true, message: 'Tables reordered successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error reordering tables:', err);
    res.status(500).json({ error: 'Failed to reorder tables' });
  } finally {
    client.release();
  }
});

// Create a new table
router.post('/', authenticateToken, async (req, res) => {
  const { table_number, available_branches } = req.body;
  try {
    if (!table_number || !table_number.trim()) {
      return res.status(400).json({ error: 'Table number/name is required' });
    }

    const trimmedTable = table_number.trim();
    const userRole = req.user.role?.toLowerCase() || '';
    let branchesToSave = available_branches || ['Branch 1', 'Branch 2', 'Branch 3'];
    
    const isAdmin = userRole === 'admin' || userRole === 'developer';
    // If restricted role creates a table, restrict it to their branch only
    if (!isAdmin && req.user.branch) {
      branchesToSave = [req.user.branch];
    }

    const maxOrderRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM tables');
    const nextOrder = parseInt(maxOrderRes.rows[0].next_order) || 1;

    const result = await pool.query(
      `INSERT INTO tables (table_number, available_branches, sort_order) 
       VALUES ($1, $2, $3) RETURNING *`,
      [trimmedTable, JSON.stringify(branchesToSave), nextOrder]
    );
    
    // Notify clients about the change
    if (req.io) {
      req.io.emit('tables-updated');
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating table:', err);
    if (err.code === '23505') { // unique violation
      return res.status(400).json({ error: 'Table name/number already exists' });
    }
    res.status(500).json({ error: 'Failed to create table' });
  }
});

// Update a table
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { table_number, status, available_branches, sort_order } = req.body;
  try {
    const trimmedTable = table_number !== undefined ? (typeof table_number === 'string' ? table_number.trim() : table_number) : null;
    const result = await pool.query(
      `UPDATE tables 
       SET table_number = COALESCE($1, table_number),
           status = COALESCE($2, status),
           available_branches = COALESCE($3, available_branches),
           sort_order = COALESCE($4, sort_order)
       WHERE id = $5 RETURNING *`,
      [trimmedTable, status, available_branches ? JSON.stringify(available_branches) : null, sort_order !== undefined ? sort_order : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Table not found' });
    }

    if (req.io) {
      req.io.emit('tables-updated');
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating table:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Table name/number already exists' });
    }
    res.status(500).json({ error: 'Failed to update table' });
  }
});

// Delete a table
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM tables WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Table not found' });
    }

    if (req.io) {
      req.io.emit('tables-updated');
    }

    res.json({ message: 'Table deleted successfully' });
  } catch (err) {
    console.error('Error deleting table:', err);
    res.status(500).json({ error: 'Failed to delete table' });
  }
});

module.exports = router;
