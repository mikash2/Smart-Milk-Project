const express = require('express');
const router = express.Router();
const AuthService = require('../services/AuthService');
const { authenticate } = require('../middleware/auth');
const { 
  validateRegistration, 
  validateLogin, 
  validatePasswordChange,
  handleValidationErrors 
} = require('../middleware/validation');

// User registration
router.post('/register', 
  validateRegistration, 
  handleValidationErrors,
  async (req, res) => {
    try {
      const result = await AuthService.register(req.body);
      
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Registration failed',
        error: error.message
      });
    }
  }
);

// User login
router.post('/login', 
  validateLogin, 
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      
      res.json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'Login failed',
        error: error.message
      });
    }
  }
);

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
router.post('/logout', 
  authenticate,
  async (req, res) => {
    try {
      await AuthService.logout(req.user.id);
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Logout failed',
        error: error.message
      });
    }
  }
);

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

module.exports = router;
