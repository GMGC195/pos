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
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
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

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role, shift: user.shift, branch: user.branch, must_change_password: user.must_change_password, employee_id: user.employee_id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '23h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, shift: user.shift, branch: user.branch, must_change_password: user.must_change_password, employee_id: user.employee_id }
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
    const result = await pool.query('SELECT id, username, email, role, shift, branch, created_at FROM users ORDER BY created_at DESC');
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
  const { username, email, password, role, shift, branch } = req.body;

  try {
    // Check if user exists
    const check = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (check.rows.length > 0) {
      return res.status(400).json({ error: 'Username or Email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role, shift, branch) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, role, shift, branch',
      [username, email, password_hash, role || 'Operator', shift || null, branch || null]
    );

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
  const { username, email, password, role, shift, branch } = req.body;
  const { id } = req.params;

  try {
    // Protection: Cannot edit a Developer user
    const role_check = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    if (role_check.rows[0]?.role?.toLowerCase() === 'developer' && req.user.role?.toLowerCase() !== 'developer') {
      return res.status(403).json({ error: 'Only Developers can modify Developer accounts' });
    }

    let query = 'UPDATE users SET username = $1, email = $2, role = $3, shift = $4, branch = $5';
    const params = [username, email, role, shift || null, branch || null, id];

    if (password) {
      const password_hash = await bcrypt.hash(password, 10);
      query += ', password_hash = $7 WHERE id = $6';
      params.push(password_hash);
    } else {
      query += ' WHERE id = $6';
    }

    const result = await pool.query(query + ' RETURNING id, username, email, role, shift, branch', params);
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

module.exports = router;
