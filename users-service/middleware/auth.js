const AuthService = require('../services/AuthService');

// Middleware to authenticate user
const authenticate = async (req, res, next) => {
  try {
    const user = await AuthService.validateRequestToken(req);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// Middleware to check if user has required role
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!AuthService.hasRole(req.user, requiredRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Middleware to check if user is admin
const requireAdmin = requireRole('admin');

// Middleware to check if user is moderator or admin
const requireModerator = requireRole('moderator');

// Middleware to check if user owns the resource or is admin
const requireOwnership = (resourceUserIdField = 'id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
    
    if (req.user.id == resourceUserId || AuthService.hasRole(req.user, 'admin')) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
  };
};

module.exports = {
  authenticate,
  requireRole,
  requireAdmin,
  requireModerator,
  requireOwnership
};
