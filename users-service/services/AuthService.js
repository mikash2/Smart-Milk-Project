const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const config = require('../config');
const db = require('../database/connection');

class AuthService {
  // Generate JWT token
  static generateToken(user) {
    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };
    
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn
    });
  }

  // Verify JWT token
  static verifyToken(token) {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // User login
  static async login(email, password) {
    try {
      // Find user by email
      const user = await User.findByEmail(email);
      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Check if user is active
      if (!user.is_active) {
        throw new Error('Account is deactivated');
      }

      // Verify password
      const isValidPassword = await user.verifyPassword(password);
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      // Update last login
      await user.updateLastLogin();

      // Generate token
      const token = this.generateToken(user);

      // Store token in database (optional - for token invalidation)
      await this.storeToken(user.id, token);

      return {
        user: user.toJSON(),
        token,
        expiresIn: config.jwt.expiresIn
      };
    } catch (error) {
      throw error;
    }
  }

  // User registration
  static async register(userData) {
    try {
      const { username, email, password, first_name, last_name, phone } = userData;

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        throw new Error('Email already registered');
      }

      const existingUsername = await User.findByUsername(username);
      if (existingUsername) {
        throw new Error('Username already taken');
      }

      // Validate password strength
      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      // Create user
      const userId = await User.create(userData);
      const user = await User.findById(userId);

      // Generate token
      const token = this.generateToken(user);

      return {
        user: user.toJSON(),
        token,
        expiresIn: config.jwt.expiresIn
      };
    } catch (error) {
      throw error;
    }
  }

  // Store token in database
  static async storeToken(userId, token) {
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

      const sql = `
        INSERT INTO user_sessions (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE token_hash = ?, expires_at = ?
      `;
      
      const tokenHash = await bcrypt.hash(token, 10);
      await db.query(sql, [userId, tokenHash, expiresAt, tokenHash, expiresAt]);
    } catch (error) {
      console.error('Failed to store token:', error.message);
    }
  }

  // Invalidate token (logout)
  static async logout(userId, token) {
    try {
      const sql = 'DELETE FROM user_sessions WHERE user_id = ?';
      await db.query(sql, [userId]);
    } catch (error) {
      console.error('Failed to logout:', error.message);
    }
  }

  // Refresh token
  static async refreshToken(userId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.is_active) {
        throw new Error('User not found or inactive');
      }

      const newToken = this.generateToken(user);
      await this.storeToken(userId, newToken);

      return {
        token: newToken,
        expiresIn: config.jwt.expiresIn
      };
    } catch (error) {
      throw error;
    }
  }

  // Change password
  static async changePassword(userId, currentPassword, newPassword) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isValidPassword = await user.verifyPassword(currentPassword);
      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }

      // Validate new password
      if (newPassword.length < 8) {
        throw new Error('New password must be at least 8 characters long');
      }

      // Change password
      const success = await user.changePassword(newPassword);
      if (!success) {
        throw new Error('Failed to change password');
      }

      // Invalidate all existing sessions
      await this.logout(userId);

      return true;
    } catch (error) {
      throw error;
    }
  }

  // Reset password (forgot password flow)
  static async resetPassword(email, newPassword) {
    try {
      const user = await User.findByEmail(email);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate new password
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      // Change password
      const success = await user.changePassword(newPassword);
      if (!success) {
        throw new Error('Failed to reset password');
      }

      // Invalidate all existing sessions
      await this.logout(user.id);

      return true;
    } catch (error) {
      throw error;
    }
  }

  // Validate token from request
  static async validateRequestToken(req) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No token provided');
      }

      const token = authHeader.substring(7);
      const decoded = this.verifyToken(token);

      // Check if user still exists and is active
      const user = await User.findById(decoded.id);
      if (!user || !user.is_active) {
        throw new Error('User not found or inactive');
      }

      return user;
    } catch (error) {
      throw error;
    }
  }

  // Check if user has required role
  static hasRole(user, requiredRole) {
    if (!user || !user.role) {
      return false;
    }

    const roleHierarchy = {
      'user': 1,
      'moderator': 2,
      'admin': 3
    };

    return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
  }
}

module.exports = AuthService;
