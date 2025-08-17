const db = require('../database/connection');
const bcrypt = require('bcryptjs');
const config = require('../config');

class User {
  constructor(userData) {
    this.id = userData.id;
    this.username = userData.username;
    this.email = userData.email;
    this.password_hash = userData.password_hash;
    this.first_name = userData.first_name;
    this.last_name = userData.last_name;
    this.phone = userData.phone;
    this.is_active = userData.is_active;
    this.is_verified = userData.is_verified;
    this.role = userData.role;
    this.created_at = userData.created_at;
    this.updated_at = userData.updated_at;
    this.last_login = userData.last_login;
  }

  // Create new user
  static async create(userData) {
    try {
      const { username, email, password, first_name, last_name, phone, role = 'user' } = userData;
      
      // Hash password
      const saltRounds = config.bcrypt.rounds;
      const password_hash = await bcrypt.hash(password, saltRounds);
      
      const sql = `
        INSERT INTO users (username, email, password_hash, first_name, last_name, phone, role)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const result = await db.query(sql, [username, email, password_hash, first_name, last_name, phone, role]);
      
      return result.insertId;
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  // Find user by ID
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const users = await db.query(sql, [id]);
      
      if (users.length === 0) {
        return null;
      }
      
      return new User(users[0]);
    } catch (error) {
      throw new Error(`Failed to find user by ID: ${error.message}`);
    }
  }

  // Find user by email
  static async findByEmail(email) {
    try {
      const sql = 'SELECT * FROM users WHERE email = ?';
      const users = await db.query(sql, [email]);
      
      if (users.length === 0) {
        return null;
      }
      
      return new User(users[0]);
    } catch (error) {
      throw new Error(`Failed to find user by email: ${error.message}`);
    }
  }

  // Find user by username
  static async findByUsername(username) {
    try {
      const sql = 'SELECT * FROM users WHERE username = ?';
      const users = await db.query(sql, [username]);
      
      if (users.length === 0) {
        return null;
      }
      
      return new User(users[0]);
    } catch (error) {
      throw new Error(`Failed to find user by username: ${error.message}`);
    }
  }

  // Get all users with pagination
  static async findAll(page = 1, limit = 10, filters = {}) {
    try {
      let sql = 'SELECT * FROM users WHERE 1=1';
      const params = [];
      
      // Apply filters
      if (filters.role) {
        sql += ' AND role = ?';
        params.push(filters.role);
      }
      
      if (filters.is_active !== undefined) {
        sql += ' AND is_active = ?';
        params.push(filters.is_active);
      }
      
      if (filters.search) {
        sql += ' AND (username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }
      
      // Add pagination
      const offset = (page - 1) * limit;
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const users = await db.query(sql, params);
      return users.map(user => new User(user));
    } catch (error) {
      throw new Error(`Failed to find users: ${error.message}`);
    }
  }

  // Update user
  async update(updateData) {
    try {
      const allowedFields = ['first_name', 'last_name', 'phone', 'is_active', 'is_verified', 'role'];
      const updates = [];
      const params = [];
      
      for (const [key, value] of Object.entries(updateData)) {
        if (allowedFields.includes(key) && value !== undefined) {
          updates.push(`${key} = ?`);
          params.push(value);
        }
      }
      
      if (updates.length === 0) {
        return false;
      }
      
      params.push(this.id);
      const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      
      const result = await db.query(sql, params);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  // Change password
  async changePassword(newPassword) {
    try {
      const saltRounds = config.bcrypt.rounds;
      const password_hash = await bcrypt.hash(newPassword, saltRounds);
      
      const sql = 'UPDATE users SET password_hash = ? WHERE id = ?';
      const result = await db.query(sql, [password_hash, this.id]);
      
      if (result.affectedRows > 0) {
        this.password_hash = password_hash;
        return true;
      }
      
      return false;
    } catch (error) {
      throw new Error(`Failed to change password: ${error.message}`);
    }
  }

  // Verify password
  async verifyPassword(password) {
    try {
      return await bcrypt.compare(password, this.password_hash);
    } catch (error) {
      throw new Error(`Failed to verify password: ${error.message}`);
    }
  }

  // Update last login
  async updateLastLogin() {
    try {
      const sql = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?';
      await db.query(sql, [this.id]);
      this.last_login = new Date();
    } catch (error) {
      console.error('Failed to update last login:', error.message);
    }
  }

  // Delete user
  async delete() {
    try {
      const sql = 'DELETE FROM users WHERE id = ?';
      const result = await db.query(sql, [this.id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  // Get user count
  static async count(filters = {}) {
    try {
      let sql = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
      const params = [];
      
      if (filters.role) {
        sql += ' AND role = ?';
        params.push(filters.role);
      }
      
      if (filters.is_active !== undefined) {
        sql += ' AND is_active = ?';
        params.push(filters.is_active);
      }
      
      const result = await db.query(sql, params);
      return result[0].count;
    } catch (error) {
      throw new Error(`Failed to count users: ${error.message}`);
    }
  }

  // Convert to JSON (exclude sensitive data)
  toJSON() {
    const user = { ...this };
    delete user.password_hash;
    return user;
  }
}

module.exports = User;
