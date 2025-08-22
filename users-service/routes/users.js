const express = require('express');
const router = express.Router();
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

// Get all users (with pagination and filters)
router.get('/', 
  authenticate, 
  requireModerator,
  validatePagination,
  handleValidationErrors,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      
      const filters = {
        role: req.query.role,
        is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
        search: req.query.search
      };
      
      const users = await User.findAll(page, limit, filters);
      const totalUsers = await User.count(filters);
      const totalPages = Math.ceil(totalUsers / limit);
      
      res.json({
        success: true,
        data: {
          users: users.map(user => user.toJSON()),
          pagination: {
            page,
            limit,
            totalUsers,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users',
        error: error.message
      });
    }
  }
);

// Get user by ID
router.get('/:id', 
  authenticate, 
  validateUserId,
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      
      // Users can only view their own profile unless they're admin/moderator
      if (req.user.role === 'user' && req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.json({
        success: true,
        data: user.toJSON()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user',
        error: error.message
      });
    }
  }
);

// Create new user (admin only)
router.post('/', 
  authenticate, 
  requireAdmin,
  async (req, res) => {
    try {
      const userId = await User.create(req.body);
      const user = await User.findById(userId);
      
      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: user.toJSON()
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Failed to create user',
        error: error.message
      });
    }
  }
);

// Update user
router.put('/:id', 
  authenticate, 
  validateUserId,
  validateUserUpdate,
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      
      // Users can only update their own profile unless they're admin
      if (req.user.role === 'user' && req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      // Only admins can change roles
      if (req.body.role && req.user.role !== 'admin') {
        delete req.body.role;
      }
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      const success = await user.update(req.body);
      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'No changes made'
        });
      }
      
      // Get updated user
      const updatedUser = await User.findById(userId);
      
      res.json({
        success: true,
        message: 'User updated successfully',
        data: updatedUser.toJSON()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update user',
        error: error.message
      });
    }
  }
);

// Delete user
router.delete('/:id', 
  authenticate, 
  requireAdmin,
  validateUserId,
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      
      // Prevent admin from deleting themselves
      if (req.user.id === userId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete your own account'
        });
      }
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      const success = await user.delete();
      if (!success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to delete user'
        });
      }
      
      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to delete user',
        error: error.message
      });
    }
  }
);

// Deactivate/Activate user
router.patch('/:id/status', 
  authenticate, 
  requireModerator,
  validateUserId,
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { is_active } = req.body;
      
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'is_active must be a boolean value'
        });
      }
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Prevent moderators from deactivating admins
      if (user.role === 'admin' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Cannot modify admin accounts'
        });
      }
      
      const success = await user.update({ is_active });
      if (!success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to update user status'
        });
      }
      
      res.json({
        success: true,
        message: `User ${is_active ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update user status',
        error: error.message
      });
    }
  }
);

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

module.exports = router;
