const express = require('express');
const router = express.Router();
const net = require('net');
const Pusher = require('pusher');
const pool = require('../db');
const { authenticateToken, isAdmin, blockSalaryPayOperator } = require('../middleware/auth');

let pusher = null;
try {
  if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER) {
    pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER,
      useTLS: true
    });
  }
} catch (err) {
  console.warn('Pusher initialization in settings skipped:', err.message);
}

router.use(blockSalaryPayOperator);

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

// GET /api/settings/salary-permissions - List all Salary Pay Operator users & their configured permissions
router.get('/salary-permissions', authenticateToken, isAdmin, async (req, res) => {
  try {
    const usersRes = await pool.query(`
      SELECT 
        u.id, 
        u.username, 
        COALESCE(e.name, u.username) as name,
        u.email, 
        u.role, 
        u.branch,
        COALESCE(spp.permission_type, 'pay_now') as permission_type,
        COALESCE(spp.allowed_months, '[]'::jsonb) as allowed_months,
        spp.updated_at,
        spp.updated_by
      FROM users u
      LEFT JOIN employees e ON (e.id::text = u.employee_id::text OR e.employee_id = u.employee_id::text)
      LEFT JOIN salary_payable_permissions spp ON spp.user_id = u.id
      WHERE LOWER(u.role) = 'salary pay operator'
      ORDER BY u.id ASC
    `);

    // Generate recent 12 months list for convenience
    const availableMonths = [];
    const now = new Date();
    for (let i = -1; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      availableMonths.push(mStr);
    }

    res.json({
      users: usersRes.rows,
      available_months: availableMonths
    });
  } catch (err) {
    console.error('Error fetching salary permissions:', err);
    res.status(500).json({ error: 'Failed to fetch salary permissions' });
  }
});

// PUT /api/settings/salary-permissions/:userId - Update a Salary Pay Operator user's permission settings
router.put('/salary-permissions/:userId', authenticateToken, isAdmin, async (req, res) => {
  const { userId } = req.params;
  const { permission_type, allowed_months } = req.body;

  const validPermission = (permission_type === 'view_only') ? 'view_only' : 'pay_now';
  const validMonths = Array.isArray(allowed_months) ? JSON.stringify(allowed_months.filter(m => /^\d{4}-\d{2}$/.test(m))) : '[]';
  const updatedBy = req.user?.username || req.user?.name || 'Admin';

  try {
    const userCheck = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(`
      INSERT INTO salary_payable_permissions (user_id, permission_type, allowed_months, updated_at, updated_by)
      VALUES ($1, $2, $3::jsonb, NOW(), $4)
      ON CONFLICT (user_id) DO UPDATE SET
        permission_type = EXCLUDED.permission_type,
        allowed_months = EXCLUDED.allowed_months,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
      RETURNING *
    `, [userId, validPermission, validMonths, updatedBy]);

    res.json({
      message: 'Salary payable user permissions updated successfully',
      permission: result.rows[0]
    });
  } catch (err) {
    console.error('Error updating salary permissions:', err);
    res.status(500).json({ error: 'Failed to update salary permissions' });
  }
});

// POST /api/settings/test-print - Send test kitchen receipt to verify printer connectivity
router.post('/test-print', authenticateToken, async (req, res) => {
  try {
    const { printerIp: reqIp, printerPort: reqPort, branchId: reqBranch } = req.body;
    const settingsRes = await pool.query('SELECT auto_print_enabled, printer_ip FROM settings ORDER BY id ASC LIMIT 1');
    const dbPrinterIp = settingsRes.rows.length > 0 && settingsRes.rows[0].printer_ip ? settingsRes.rows[0].printer_ip : '127.0.0.1';
    const printerIp = reqIp || dbPrinterIp;
    const printerPort = parseInt(reqPort || 9100);
    const branchNumber = String(reqBranch || req.user?.branch || '1').replace(/\D/g, '') || '1';
    const channelName = `branch-${branchNumber}-orders`;

    const ESC = '\x1B';
    const GS = '\x1D';
    const INIT = ESC + '@';
    const SELECT_FONT_A = ESC + 'M' + '\x00';
    const SET_LINE_SPACING = ESC + '3' + '\x26';
    const BOLD_ON = ESC + 'E' + '\x01';
    const BOLD_OFF = ESC + 'E' + '\x00';
    const CENTER = ESC + 'a' + '\x01';
    const LEFT = ESC + 'a' + '\x00';
    const TEXT_NORMAL = GS + '!' + '\x00';
    const TEXT_DOUBLE = GS + '!' + '\x11';
    const CUT = GS + 'V' + '\x41' + '\x03';
    const LF = '\n';
    const LINE_WIDTH = 42;

    const rightAlign = (leftStr, rightStr, width = LINE_WIDTH) => {
      const left = String(leftStr || '');
      const right = String(rightStr || '');
      const space = Math.max(1, width - (left.length + right.length));
      return left + ' '.repeat(space) + right;
    };

    let ticket = INIT + SELECT_FONT_A + SET_LINE_SPACING;
    ticket += CENTER + BOLD_ON + TEXT_DOUBLE + `B${branchNumber} - KITCHEN TEST` + TEXT_NORMAL + BOLD_OFF + LF;
    ticket += CENTER + 'Printer Hardware Diagnostic Slip' + LF;
    ticket += '='.repeat(LINE_WIDTH) + LF;

    ticket += LEFT;
    ticket += rightAlign('Order Type:', 'Dine-In (TEST)') + LF;
    ticket += rightAlign('Table:', 'T-01') + LF;
    ticket += rightAlign('Server / User:', req.user?.username || 'Admin') + LF;
    ticket += rightAlign('Target Printer:', `${printerIp}:${printerPort}`) + LF;
    ticket += rightAlign('Date & Time:', new Date().toLocaleString()) + LF;
    ticket += '-'.repeat(LINE_WIDTH) + LF;

    ticket += BOLD_ON + 'QTY  ITEM                         PRICE' + BOLD_OFF + LF;
    ticket += '-'.repeat(LINE_WIDTH) + LF;
    ticket += rightAlign('1x   Special Pizza (Large)', 'SAR 35.00') + LF;
    ticket += rightAlign('2x   Fresh Soft Drink', 'SAR 10.00') + LF;
    ticket += '-'.repeat(LINE_WIDTH) + LF;

    ticket += BOLD_ON + rightAlign('TOTAL AMOUNT:', 'SAR 45.00') + BOLD_OFF + LF;
    ticket += '='.repeat(LINE_WIDTH) + LF;
    ticket += CENTER + 'PRINTER STATUS: OK / VERIFIED' + LF;
    ticket += LF + LF + LF + LF + CUT;

    const rawBuffer = Buffer.from(ticket, 'latin1');
    const base64EscPos = rawBuffer.toString('base64');

    const payload = {
      orderId: 'TEST-999',
      orderNumber: 'TEST-999',
      branchId: parseInt(branchNumber),
      waiterName: req.user?.username || 'Staff',
      tableName: 'Table T-01',
      orderType: 'Dine-In (Test)',
      printerIp: printerIp,
      printerPort: printerPort,
      rawEscPos: base64EscPos,
      subtotal: 45,
      total: 45,
      items: [
        { name: 'Special Pizza (Large)', qty: 1, amount: 35 },
        { name: 'Fresh Soft Drink', qty: 2, amount: 5 }
      ]
    };

    let dispatchedPusher = false;
    let pusherError = null;

    if (pusher) {
      try {
        await pusher.trigger(channelName, 'print-kitchen-ticket', payload);
        dispatchedPusher = true;
      } catch (pErr) {
        pusherError = pErr.message;
      }
    }

    let tcpSuccess = false;
    try {
      await new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2500);
        socket.connect(printerPort, printerIp, () => {
          socket.write(rawBuffer, (wErr) => {
            if (!wErr) tcpSuccess = true;
            socket.end();
            resolve();
          });
        });
        socket.on('error', () => { socket.destroy(); resolve(); });
        socket.on('timeout', () => { socket.destroy(); resolve(); });
      });
    } catch (e) {}

    if (!dispatchedPusher && !tcpSuccess) {
      return res.status(500).json({ 
        error: pusherError || 'Could not connect to printer at ' + printerIp + ':' + printerPort + '. Please ensure printer or print agent is active.' 
      });
    }

    return res.json({
      success: true,
      message: 'Test kitchen receipt sent to printer successfully!',
      target: `${printerIp}:${printerPort}`,
      channel: channelName,
      tcpDirect: tcpSuccess,
      pusherDispatched: dispatchedPusher
    });
  } catch (err) {
    console.error('Error in /test-print:', err);
    res.status(500).json({ error: err.message || 'Failed to send test print' });
  }
});

module.exports = router;
