const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// GET /api/settings - Fetch the current POS settings
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings ORDER BY id ASC LIMIT 1');
    if (result.rows.length > 0) {
      const data = result.rows[0];
      if (!data.report_emails || (Array.isArray(data.report_emails) && data.report_emails.length === 0)) {
        data.report_emails = ['mr.caffee25@gmail.com'];
      }
      res.json(data);
    } else {
      res.json({ 
        auto_print_enabled: false, 
        printer_ip: '127.0.0.1', 
        low_stock_behavior: 'block',
        report_emails: ['mr.caffee25@gmail.com']
      });
    }
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings - Update POS settings
router.put('/', authenticateToken, async (req, res) => {
  const { auto_print_enabled, printer_ip, low_stock_behavior, report_emails } = req.body;
  const userRole = (req.user?.role || '').trim().toLowerCase();
  const isAdminRole = userRole === 'admin' || userRole === 'developer';

  // Protect inventory behavior and report email recipient modifications for admin/developer
  if ((low_stock_behavior !== undefined || report_emails !== undefined) && !isAdminRole) {
    return res.status(403).json({ error: 'Admin access required to modify global inventory or report email settings' });
  }

  try {
    const check = await pool.query('SELECT * FROM settings ORDER BY id ASC LIMIT 1');
    let result;
    
    // Format report_emails if provided
    let emailsToSave = undefined;
    if (report_emails !== undefined) {
      if (Array.isArray(report_emails)) {
        emailsToSave = JSON.stringify(
          report_emails.map(e => (typeof e === 'string' ? e.trim().toLowerCase() : '')).filter(Boolean)
        );
      } else if (typeof report_emails === 'string') {
        emailsToSave = JSON.stringify(
          report_emails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
        );
      }
    }

    if (check.rows.length > 0) {
      const current = check.rows[0];
      const newAutoPrint = auto_print_enabled !== undefined ? auto_print_enabled : current.auto_print_enabled;
      const newPrinterIp = printer_ip !== undefined ? printer_ip : current.printer_ip;
      const newLowStock = low_stock_behavior !== undefined ? low_stock_behavior : (current.low_stock_behavior || 'block');
      const newReportEmails = emailsToSave !== undefined ? emailsToSave : JSON.stringify(current.report_emails || ['mr.caffee25@gmail.com']);

      result = await pool.query(
        'UPDATE settings SET auto_print_enabled = $1, printer_ip = $2, low_stock_behavior = $3, report_emails = $4 WHERE id = $5 RETURNING *',
        [newAutoPrint, newPrinterIp, newLowStock, newReportEmails, current.id]
      );
    } else {
      const finalEmails = emailsToSave || JSON.stringify(['mr.caffee25@gmail.com']);
      result = await pool.query(
        'INSERT INTO settings (auto_print_enabled, printer_ip, low_stock_behavior, report_emails) VALUES ($1, $2, $3, $4) RETURNING *',
        [auto_print_enabled ?? false, printer_ip || '127.0.0.1', low_stock_behavior || 'block', finalEmails]
      );
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
