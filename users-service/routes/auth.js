const express = require('express');
const router = express.Router();
const AuthService = require('../services/AuthService');
const { authenticate } = require('../middleware/auth');
const { validateRegistration, validateLogin, validatePasswordChange, handleValidationErrors } = require('../middleware/validation');
const db = require('../database/connection');

// User registration
router.post('/register', async (req, res) => {
  const { username, password, email, full_name, device_id } = req.body || {};
  
  console.log(`[users] 📝 Registration attempt for username: ${username}, email: ${email}, device: ${device_id}`);

  if (!username || !password || !email) {
    return res.status(400).json({ success: false, message: 'username, password and email are required' });
  }

  const uname = String(username).trim();
  const emailLower = String(email).toLowerCase().trim();
  const deviceId = (device_id && String(device_id).trim()) || process.env.DEVICE_ID || 'device1';

  // basic validation
  if (!/^[a-zA-Z0-9._-]{3,100}$/.test(uname)) {
    return res.status(400).json({ success: false, message: 'invalid username (3-100 chars, letters/digits/._-)' });
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(emailLower)) {
    return res.status(400).json({ success: false, message: 'invalid email' });
  }

  try {
    // uniqueness
    const [uTaken] = await db.query('SELECT 1 FROM `users` WHERE `username` = ? LIMIT 1', [uname]);
    if (uTaken) {
      console.log(`[users] ❌ Registration failed - Username already taken: ${uname}`);
      return res.status(409).json({ success: false, message: 'Username already taken' });
    }

    const [eTaken] = await db.query('SELECT 1 FROM `users` WHERE `email` = ? LIMIT 1', [emailLower]);
    if (eTaken) {
      console.log(`[users] ❌ Registration failed - Email already registered: ${emailLower}`);
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Insert new user
    const [result] = await db.query(
      'INSERT INTO `users` (`username`, `password`, `email`, `full_name`, `device_id`) VALUES (?, ?, ?, ?, ?)',
      [uname, password, emailLower, full_name, deviceId]
    );

    console.log(`[users] ✅ User registered and saved to DB - ID: ${result.insertId}, Username: ${uname}, Device: ${deviceId}`);
    return res.status(201).json({ success: true, user_id: result.insertId, username: uname, device_id: deviceId });
    
  } catch (e) {
    console.log(`[users] ❌ Registration failed - Database error: ${e.message}`);
    return res.status(500).json({ success: false, message: 'Registration failed', error: e.message });
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
      console.log(`[users] ❌ Login failed - User not found: ${uname}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];
    
    if (user.pwd !== password) {
      console.log(`[users] ❌ Login failed - Invalid password for user: ${uname}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    req.app.locals.createSession(res, user.id);
    delete user.pwd;
    
    console.log(`[users] ✅ Login successful - User: ${uname} (ID: ${user.id}) session created`);
    res.json({ success: true, user });
    
  } catch (e) {
    console.log(`[users] ❌ Login failed - Database error: ${e.message}`);
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
