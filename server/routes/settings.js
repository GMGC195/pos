const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// GET /api/settings - Fetch the current POS settings
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings ORDER BY id ASC LIMIT 1');
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json({ auto_print_enabled: false, printer_ip: '127.0.0.1' });
    }
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings - Update POS settings
router.put('/', authenticateToken, isAdmin, async (req, res) => {
  const { auto_print_enabled, printer_ip } = req.body;
  try {
    const check = await pool.query('SELECT id FROM settings ORDER BY id ASC LIMIT 1');
    let result;
    
    if (check.rows.length > 0) {
      result = await pool.query(
        'UPDATE settings SET auto_print_enabled = $1, printer_ip = $2 WHERE id = $3 RETURNING *',
        [auto_print_enabled, printer_ip, check.rows[0].id]
      );
    } else {
      result = await pool.query(
        'INSERT INTO settings (auto_print_enabled, printer_ip) VALUES ($1, $2) RETURNING *',
        [auto_print_enabled, printer_ip]
      );
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
