const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../db');

// Configure NodeMailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const { authenticateToken, isAdmin } = require('../middleware/auth');
const { recordActivityLog } = require('./activityLogs');

const VALID_STORE_BRANCHES = ['Branch 1', 'Branch 2', 'Branch 3'];

function normalizeUserBranches(role, branch, assigned_branches) {
  const r = (role || '').trim().toLowerCase();
  if (r === 'store man') {
    const b = VALID_STORE_BRANCHES.includes(branch) ? branch : null;
    if (!b) return { error: 'Store Man must be assigned to a single valid branch (Branch 1, Branch 2, or Branch 3).' };
    return { finalBranch: b, finalAssignedBranches: [b] };
  }
  if (r === 'data entry') {
    let arr = Array.isArray(assigned_branches)
      ? assigned_branches
      : (typeof assigned_branches === 'string' && assigned_branches.trim() ? assigned_branches.split(',').map(s => s.trim()) : (branch ? [branch] : []));
    arr = [...new Set(arr.filter(b => VALID_STORE_BRANCHES.includes(b)))];
    if (arr.length === 0) {
      return { error: 'Data Entry user must be assigned to at least one valid branch (Branch 1, Branch 2, or Branch 3).' };
    }
    return { finalBranch: arr.join(', '), finalAssignedBranches: arr };
  }
  return {
    finalBranch: branch || null,
    finalAssignedBranches: branch ? [branch] : []
  };
}

// Helper to generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// -------------------------------------------------------------
// POST /api/auth/login
// -------------------------------------------------------------
router.post('/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;

  try {
    const result = await pool.queryWithRetry(
      'SELECT * FROM "users" WHERE username = $1 OR email = $1',
      [usernameOrEmail]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last_login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const assignedBranches = Array.isArray(user.assigned_branches) && user.assigned_branches.length > 0
      ? user.assigned_branches
      : (user.branch ? [user.branch] : []);

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role, shift: user.shift, branch: user.branch, assigned_branches: assignedBranches, must_change_password: user.must_change_password, employee_id: user.employee_id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '10d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, shift: user.shift, branch: user.branch, assigned_branches: assignedBranches, must_change_password: user.must_change_password, employee_id: user.employee_id }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------------------------------------------------
// POST /api/auth/change-password
// -------------------------------------------------------------
router.post('/change-password', authenticateToken, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    const password_hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [password_hash, req.user.id]
    );
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------------------------------------------------
// GET /api/auth/users (Admin only)
// -------------------------------------------------------------
router.get('/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id INTEGER').catch(() => {});
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_branches JSONB DEFAULT '[]'::jsonb").catch(() => {});
    const result = await pool.query(`
      SELECT 
        u.id, u.username, u.email, u.role, u.shift, u.branch, u.assigned_branches, u.created_at, u.employee_id,
        e.name AS employee_name, e.employee_id AS employee_code, e.role AS employee_role, e.branch AS employee_branch, e.department AS employee_department
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/employee-options (For linking in User Management)
router.get('/employee-options', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.id, e.name, e.employee_id AS employee_code, e.role, e.department, e.branch, e.status,
        u.id AS linked_user_id, u.username AS linked_username
      FROM employees e
      LEFT JOIN users u ON u.employee_id = e.id
      ORDER BY e.name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------------------------------------------------
// POST /api/auth/users (Admin only)
// -------------------------------------------------------------
router.post('/users', authenticateToken, isAdmin, async (req, res) => {
  const { username, email, password, role, shift, branch, assigned_branches, employee_id } = req.body;

  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id INTEGER').catch(() => {});
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_branches JSONB DEFAULT '[]'::jsonb").catch(() => {});

    // Check if user exists
    const check = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (check.rows.length > 0) {
      return res.status(400).json({ error: 'Username or Email already exists' });
    }

    const parsedEmpId = employee_id ? parseInt(employee_id) : null;
    if (parsedEmpId) {
      const existingLink = await pool.query('SELECT id, username FROM users WHERE employee_id = $1', [parsedEmpId]);
      if (existingLink.rows.length > 0) {
        return res.status(400).json({ 
          error: `This employee is already linked to user account '${existingLink.rows[0].username}'. Please choose another employee or unlink first.` 
        });
      }
    }

    const branchNorm = normalizeUserBranches(role, branch, assigned_branches);
    if (branchNorm.error) {
      return res.status(400).json({ error: branchNorm.error });
    }

    const password_hash = await bcrypt.hash(password, 10);
    let finalBranch = branchNorm.finalBranch;
    if (['Order Taker', 'Cashier'].includes(role) && (!finalBranch || finalBranch.trim() === '')) finalBranch = 'Branch 1';
    if (role === 'Operator' && (!finalBranch || finalBranch.trim() === '')) finalBranch = 'Restaurant 1';

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role, shift, branch, assigned_branches, employee_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username, email, role, shift, branch, assigned_branches, employee_id',
      [username, email, password_hash, role || 'Operator', shift || null, finalBranch || null, JSON.stringify(branchNorm.finalAssignedBranches), parsedEmpId]
    );

    await recordActivityLog(pool, {
      module: 'Store',
      action: 'USER_CREATED',
      entity_id: result.rows[0].id,
      entity_name: result.rows[0].username,
      description: `Created user '${result.rows[0].username}' with role '${result.rows[0].role}'`,
      new_data: { role: result.rows[0].role, branch: result.rows[0].branch, assigned_branches: result.rows[0].assigned_branches },
      performed_by: req.user?.username || 'Admin',
      branch: result.rows[0].branch || 'All'
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------------------------------------------------
// PUT /api/auth/users/:id (Admin only)
// -------------------------------------------------------------
router.put('/users/:id', authenticateToken, isAdmin, async (req, res) => {
  const { username, email, password, role, shift, branch, assigned_branches, employee_id } = req.body;
  const { id } = req.params;

  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id INTEGER').catch(() => {});
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_branches JSONB DEFAULT '[]'::jsonb").catch(() => {});

    // Protection: Cannot edit a Developer user
    const role_check = await pool.query('SELECT role, branch, assigned_branches, username FROM users WHERE id = $1', [id]);
    if (role_check.rows[0]?.role?.toLowerCase() === 'developer' && req.user.role?.toLowerCase() !== 'developer') {
      return res.status(403).json({ error: 'Only Developers can modify Developer accounts' });
    }

    const parsedEmpId = (employee_id !== undefined && employee_id !== null && employee_id !== '') ? parseInt(employee_id) : null;
    if (parsedEmpId) {
      const existingLink = await pool.query('SELECT id, username FROM users WHERE employee_id = $1 AND id != $2', [parsedEmpId, id]);
      if (existingLink.rows.length > 0) {
        return res.status(400).json({ 
          error: `This employee is already linked to user account '${existingLink.rows[0].username}'. Please choose another employee or unlink first.` 
        });
      }
    }

    const branchNorm = normalizeUserBranches(role, branch, assigned_branches);
    if (branchNorm.error) {
      return res.status(400).json({ error: branchNorm.error });
    }

    let finalBranch = branchNorm.finalBranch;
    if (['Order Taker', 'Cashier'].includes(role) && (!finalBranch || finalBranch.trim() === '')) finalBranch = 'Branch 1';
    if (role === 'Operator' && (!finalBranch || finalBranch.trim() === '')) finalBranch = 'Restaurant 1';

    let query = 'UPDATE users SET username = $1, email = $2, role = $3, shift = $4, branch = $5, assigned_branches = $6, employee_id = $7';
    const params = [username, email, role, shift || null, finalBranch || null, JSON.stringify(branchNorm.finalAssignedBranches), parsedEmpId, id];

    if (password) {
      const password_hash = await bcrypt.hash(password, 10);
      query += ', password_hash = $9 WHERE id = $8';
      params.push(password_hash);
    } else {
      query += ' WHERE id = $8';
    }

    const result = await pool.query(query + ' RETURNING id, username, email, role, shift, branch, assigned_branches, employee_id', params);

    await recordActivityLog(pool, {
      module: 'Store',
      action: 'USER_UPDATED',
      entity_id: id,
      entity_name: username,
      description: `Updated user '${username}' role/branch assignment`,
      old_data: role_check.rows[0] || null,
      new_data: { role, branch: finalBranch, assigned_branches: branchNorm.finalAssignedBranches },
      performed_by: req.user?.username || 'Admin',
      branch: finalBranch || 'All'
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------------------------------------------------
// DELETE /api/auth/users/:id (Admin only)
// -------------------------------------------------------------
router.delete('/users/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  try {
    // Protection: Cannot delete a Developer user
    const role_check = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    if (role_check.rows[0]?.role?.toLowerCase() === 'developer' && req.user.role?.toLowerCase() !== 'developer') {
      return res.status(403).json({ error: 'Only Developers can delete Developer accounts' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------------------------------------------------
// GET /api/auth/profile (Get self)
// -------------------------------------------------------------
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, role, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------------------------------------------------
// PUT /api/auth/profile (Update self)
// -------------------------------------------------------------
router.put('/profile', authenticateToken, async (req, res) => {
  const { username, email, password } = req.body;
  const id = req.user.id;

  try {
    let query = 'UPDATE users SET username = $1, email = $2';
    const params = [username, email, id];

    if (password) {
      const password_hash = await bcrypt.hash(password, 10);
      query += ', password_hash = $4 WHERE id = $3';
      params.push(password_hash);
    } else {
      query += ' WHERE id = $3';
    }

    const result = await pool.query(query + ' RETURNING id, username, email, role', params);
    res.json({
      message: 'Profile updated',
      user: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------------------------------------------------
// POST /api/auth/forgot-password
// -------------------------------------------------------------
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.json({ message: 'If an account with that email exists, an OTP has been sent.' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); 

    await pool.query(
      'UPDATE users SET otp = $1, otp_expiry = $2 WHERE id = $3',
      [otp, otpExpiry, user.id]
    );

    await transporter.sendMail({
      from: `"DPnJJ Support" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Password Reset OTP - DPnJJ',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>Hello ${user.username},</p>
          <p>We received a request to reset your password for your DPnJJ account.</p>
          <p>Your One-Time Password (OTP) is:</p>
          <h1 style="color: #4A90E2; letter-spacing: 5px;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
          <p>If you did not request this reset, please ignore this email.</p>
        </div>
      `,
    });

    res.json({ message: 'If an account with that email exists, an OTP has been sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while sending OTP' });
  }
});

// -------------------------------------------------------------
// POST /api/auth/reset-password
// -------------------------------------------------------------
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    if (user.otp !== otp || new Date() > new Date(user.otp_expiry)) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, otp = NULL, otp_expiry = NULL WHERE id = $2',
      [hashedPassword, user.id]
    );

    res.json({ message: 'Password has been successfully reset' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------------------------------------------------
// POST /api/auth/verify-developer
// Validates developer credentials and issues short-lived dev token
// -------------------------------------------------------------
router.post('/verify-developer', async (req, res) => {
  const { usernameOrEmail, password } = req.body;

  if (!usernameOrEmail || !password) {
    return res.status(400).json({ error: 'Username/Email and Password are required.' });
  }

  try {
    const queryFn = pool.queryWithRetry ? pool.queryWithRetry.bind(pool) : pool.query.bind(pool);
    const result = await queryFn(
      'SELECT id, username, email, password_hash, role, branch FROM "users" WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [usernameOrEmail.trim()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials. User not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });
    }

    const userRole = (user.role || '').trim().toLowerCase();
    if (userRole !== 'developer' && userRole !== 'admin') {
      return res.status(403).json({ 
        error: `Access Denied: Account '${user.username}' has role '${user.role}'. Only authorized Developer and Admin accounts can edit closed shift records.` 
      });
    }

    // Generate short-lived authorization token (valid for 15 minutes)
    const devToken = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: userRole,
        purpose: 'shift_closing_edit'
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '15m' }
    );

    res.json({
      success: true,
      message: 'Developer authenticated successfully.',
      devToken,
      developer: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Error verifying developer:', err);
    res.status(500).json({ error: 'Internal server error while verifying developer.' });
  }
});

module.exports = router;
