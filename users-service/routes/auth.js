const express = require('express');
const router = express.Router();
const AuthService = require('../services/AuthService');
const { authenticate } = require('../middleware/auth');
const { validateRegistration, validateLogin, validatePasswordChange, handleValidationErrors } = require('../middleware/validation');
const db = require('../database/connection');

// User registration
router.post('/register', async (req, res) => {
  const { username, password, email, full_name, phone = null, device_id } = req.body || {};

  if (!username || !password || !email || !device_id) {
    return res.status(400).json({ success: false, message: 'username, password, email and device_id are required' });
  }

  const uname = String(username).trim();
  const emailLower = String(email).toLowerCase().trim();
  const deviceId = String(device_id).trim();

  // ולידציה בסיסית
  if (!/^[a-zA-Z0-9._-]{3,100}$/.test(uname)) {
    return res.status(400).json({ success: false, message: 'invalid username (3-100 chars, letters/digits/._-)' });
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(emailLower)) {
    return res.status(400).json({ success: false, message: 'invalid email' });
  }
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(deviceId)) {
    return res.status(400).json({ success: false, message: 'invalid device_id (3-50 chars, letters/digits/._-)' });
  }

  try {
    // ייחודיות
    const [uTaken] = await db.query('SELECT 1 FROM `users` WHERE `username` = ? LIMIT 1', [uname]);
    if (uTaken) return res.status(409).json({ success: false, message: 'Username already taken' });

    const [eTaken] = await db.query('SELECT 1 FROM `users` WHERE `email` = ? LIMIT 1', [emailLower]);
    if (eTaken) return res.status(409).json({ success: false, message: 'Email already registered' });

    const [dTaken] = await db.query('SELECT 1 FROM `users` WHERE `device_id` = ? LIMIT 1', [deviceId]);
    if (dTaken) return res.status(409).json({ success: false, message: 'Device ID already registered' });

    // הוספה
    const result = await db.query(
      'INSERT INTO `users` (`username`,`password`,`email`,`full_name`,`phone`,`device_id`) VALUES (?,?,?,?,?,?)',
      [uname, password, emailLower, full_name || null, phone || null, deviceId]
    );

    return res.status(201).json({ success: true, user_id: result.insertId, username: uname });
  } catch (e) {
    console.error('REGISTER error:', {
      code: e.code, errno: e.errno, sqlState: e.sqlState,
      message: e.sqlMessage || e.message, sql: e.sql
    });

    if (e.code === 'ER_DUP_ENTRY') {
      const field = /username/i.test(e.sqlMessage) ? 'Username'
                 : /email/i.test(e.sqlMessage)    ? 'Email'
                 : /device_id/i.test(e.sqlMessage) ? 'Device ID'
                 : 'Value';
      return res.status(409).json({ success: false, message: `${field} already exists` });
    }
    return res.status(500).json({ success: false, message: e.sqlMessage || e.message || 'DB error' });
  }
});
// User login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'username and password are required'
    });
  }

  try {
    const uname = String(username).trim();

    // שליפה לפי username בלבד
    const sql = 'SELECT `id`,`email`,`username`,`full_name`,`password` AS `pwd` FROM `users` WHERE `username` = ? LIMIT 1';
    const rows = await db.query(sql, [uname]);

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];
    if (user.pwd !== password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    req.app.locals.createSession(res, user.id);
    delete user.pwd;
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ success: false, message: 'DB error', error: e.message });
  }
});

// Refresh token
router.post('/refresh', 
  authenticate,
  async (req, res) => {
    try {
      const result = await AuthService.refreshToken(req.user.id);
      
      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Token refresh failed',
        error: error.message
      });
    }
  }
);

// Change password
router.post('/change-password', 
  authenticate,
  validatePasswordChange,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      await AuthService.changePassword(req.user.id, currentPassword, newPassword);
      
      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Password change failed',
        error: error.message
      });
    }
  }
);

// Reset password (forgot password)
router.post('/reset-password', 
  async (req, res) => {
    try {
      const { email, newPassword } = req.body;
      
      if (!email || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Email and new password are required'
        });
      }
      
      await AuthService.resetPassword(email, newPassword);
      
      res.json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Password reset failed',
        error: error.message
      });
    }
  }
);

// Logout
router.post('/logout', (req, res) => {
  const s = req.app.locals.getSession(req);
  if (s) req.app.locals.destroySession(res, s.sid);
  else req.app.locals.destroySession(res, null);
  res.json({ success: true });
});


// Get current user profile
router.get('/profile', 
  authenticate,
  async (req, res) => {
    try {
      res.json({
        success: true,
        data: req.user.toJSON()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get profile',
        error: error.message
      });
    }
  }
);

//Get user email by ID
router.get('/users/:id/email', async (req, res) => {
  try {
    const rows = await db.query('SELECT email FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, email: rows[0].email });
  } catch (e) {
    res.status(500).json({ success: false, message: 'DB error', error: e.message });
  }
});


module.exports = router;
