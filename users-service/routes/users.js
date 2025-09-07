const express = require('express');
const router = express.Router();
const db = require('../database/connection');
const User = require('../models/User');
const { 
  authenticate, 
  requireAdmin, 
  requireModerator, 
  requireOwnership 
} = require('../middleware/auth');
const { 
  validateUserUpdate, 
  validateUserId, 
  validatePagination,
  handleValidationErrors 
} = require('../middleware/validation');


// Get user statistics (admin only)
router.get('/stats/overview', 
  authenticate, 
  requireAdmin,
  async (req, res) => {
    try {
      const totalUsers = await User.count();
      const activeUsers = await User.count({ is_active: true });
      const verifiedUsers = await User.count({ is_verified: true });
      const adminUsers = await User.count({ role: 'admin' });
      const moderatorUsers = await User.count({ role: 'moderator' });
      const regularUsers = await User.count({ role: 'user' });
      
      res.json({
        success: true,
        data: {
          totalUsers,
          activeUsers,
          inactiveUsers: totalUsers - activeUsers,
          verifiedUsers,
          unverifiedUsers: totalUsers - verifiedUsers,
          roleDistribution: {
            admin: adminUsers,
            moderator: moderatorUsers,
            user: regularUsers
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user statistics',
        error: error.message
      });
    }
  }
);

// Get user settings
router.get('/UserSettings/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }
    
    // Get user settings from database
    const userSettings = await db.query(`
      SELECT full_name, username, email, phone, password FROM users WHERE id = ?
    `, [userId]);
    
    if (!userSettings.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const user = userSettings[0];
    
    res.json({
      success: true,
      userId: parseInt(userId),
      full_name: user.full_name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      password: user.password // Note: You might want to exclude this for security
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update user settings
router.put('/UserSettings', async (req, res) => {
  console.log('[UserSettings] PUT request received:', req.body); // Add this line

  try {
    const { userId, full_name, username, email, phone, password } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }
    
    // Build dynamic update query based on provided fields
    const updates = [];
    const values = [];
    
    if (full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(full_name);
    }
    if (username !== undefined) {
      updates.push('username = ?');
      values.push(username);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone);
    }
    if (password !== undefined) {
      updates.push('password = ?');
      values.push(password);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No fields to update' 
      });
    }
    
    values.push(userId); // Add userId for WHERE clause
    
    // Update user settings
    await db.query(`
      UPDATE users 
      SET ${updates.join(', ')} 
      WHERE id = ?
    `, values);
    
    res.json({
      success: true,
      message: 'User settings updated successfully'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});


module.exports = router;
