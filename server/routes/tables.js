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

    query += " ORDER BY NULLIF(regexp_replace(table_number, '\\D', '', 'g'), '')::int ASC, table_number ASC";

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
    const result = await pool.query("SELECT * FROM tables ORDER BY NULLIF(regexp_replace(table_number, '\\D', '', 'g'), '')::int ASC, table_number ASC");
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching all tables:', err);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Create a new table
router.post('/', authenticateToken, async (req, res) => {
  const { table_number, available_branches } = req.body;
  try {
    if (!table_number) {
      return res.status(400).json({ error: 'Table number is required' });
    }

    const userRole = req.user.role?.toLowerCase() || '';
    let branchesToSave = available_branches || ['Branch 1', 'Branch 2', 'Branch 3'];
    
    const isAdmin = userRole === 'admin' || userRole === 'developer';
    // If restricted role creates a table, restrict it to their branch only
    if (!isAdmin && req.user.branch) {
      branchesToSave = [req.user.branch];
    }

    const result = await pool.query(
      `INSERT INTO tables (table_number, available_branches) 
       VALUES ($1, $2) RETURNING *`,
      [table_number, JSON.stringify(branchesToSave)]
    );
    
    // Notify clients about the change
    if (req.io) {
      req.io.emit('tables-updated');
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating table:', err);
    if (err.code === '23505') { // unique violation
      return res.status(400).json({ error: 'Table number already exists' });
    }
    res.status(500).json({ error: 'Failed to create table' });
  }
});

// Update a table
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { table_number, status, available_branches } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tables 
       SET table_number = COALESCE($1, table_number),
           status = COALESCE($2, status),
           available_branches = COALESCE($3, available_branches)
       WHERE id = $4 RETURNING *`,
      [table_number, status, available_branches ? JSON.stringify(available_branches) : null, id]
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
      return res.status(400).json({ error: 'Table number already exists' });
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
