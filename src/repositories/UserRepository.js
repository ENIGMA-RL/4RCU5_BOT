import { db } from '../database/db.js';
import { log } from '../utils/logger.js';

export class UserRepository {
  /**
   * Get user by ID
   * @param {string} userId - Discord user ID
   * @returns {Object|null} User data or null if not found
   */
  static getUserById(userId) {
    try {
      const stmt = db.prepare('SELECT * FROM users WHERE userId = ?');
      return stmt.get(userId);
    } catch (error) {
      log.error('Error getting user by ID', error, { userId });
      return null;
    }
  }

  /**
   * Create or update user
   * @param {string} userId - Discord user ID
   * @param {string} username - Discord username
   * @param {Object} data - User data to insert/update
   * @returns {boolean} Success status
   */
  static upsertUser(userId, username, data = {}) {
    try {
      const stmt = db.prepare(`
        INSERT INTO users (userId, username, messageXP, voiceXP, totalXP, level, totalLevel, birthday, lastMessageDate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET
          username = excluded.username,
          messageXP = excluded.messageXP,
          voiceXP = excluded.voiceXP,
          totalXP = excluded.totalXP,
          level = excluded.level,
          totalLevel = excluded.totalLevel,
          birthday = excluded.birthday,
          lastMessageDate = excluded.lastMessageDate
      `);
      
      const result = stmt.run(
        userId,
        username,
        data.messageXP || 0,
        data.voiceXP || 0,
        data.totalXP || 0,
        data.level || 1,
        data.totalLevel || 1,
        data.birthday || null,
        data.lastMessageDate || new Date().toISOString()
      );
      
      return result.changes > 0;
    } catch (error) {
      log.error('Error upserting user', error, { userId, username });
      return false;
    }
  }

  /**
   * Get top users by XP
   * @param {number} limit - Number of users to return
   * @param {string} orderBy - Field to order by (totalXP, messageXP, voiceXP)
   * @returns {Array} Array of user objects
   */
  static getTopUsers(limit = 10, orderBy = 'totalXP') {
    try {
      const validOrderBy = ['totalXP', 'messageXP', 'voiceXP', 'level', 'totalLevel'];
      const field = validOrderBy.includes(orderBy) ? orderBy : 'totalXP';
      
      const stmt = db.prepare(`
        SELECT userId, username, messageXP, voiceXP, totalXP, level, totalLevel
        FROM users 
        ORDER BY ${field} DESC 
        LIMIT ?
      `);
      
      return stmt.all(limit);
    } catch (error) {
      log.error('Error getting top users', error, { limit, orderBy });
      return [];
    }
  }

  /**
   * Update user XP
   * @param {string} userId - Discord user ID
   * @param {number} messageXP - Message XP to add
   * @param {number} voiceXP - Voice XP to add
   * @returns {boolean} Success status
   */
  static updateUserXP(userId, messageXP = 0, voiceXP = 0) {
    try {
      const stmt = db.prepare(`
        UPDATE users 
        SET messageXP = messageXP + ?, 
            voiceXP = voiceXP + ?, 
            totalXP = totalXP + ? + ?,
            lastMessageDate = ?
        WHERE userId = ?
      `);
      
      const result = stmt.run(messageXP, voiceXP, messageXP, voiceXP, new Date().toISOString(), userId);
      return result.changes > 0;
    } catch (error) {
      log.error('Error updating user XP', error, { userId, messageXP, voiceXP });
      return false;
    }
  }

  /**
   * Get users with birthdays today
   * @returns {Array} Array of users with birthdays today
   */
  static getUsersWithBirthdayToday() {
    try {
      const today = new Date();
      const month = today.getMonth() + 1;
      const day = today.getDate();
      
      const stmt = db.prepare(`
        SELECT userId, username, birthday
        FROM users 
        WHERE birthday IS NOT NULL 
        AND strftime('%m', birthday) = ? 
        AND strftime('%d', birthday) = ?
      `);
      
      return stmt.all(month.toString().padStart(2, '0'), day.toString().padStart(2, '0'));
    } catch (error) {
      log.error('Error getting users with birthday today', error);
      return [];
    }
  }

  /**
   * Delete user
   * @param {string} userId - Discord user ID
   * @returns {boolean} Success status
   */
  static deleteUser(userId) {
    try {
      const stmt = db.prepare('DELETE FROM users WHERE userId = ?');
      const result = stmt.run(userId);
      return result.changes > 0;
    } catch (error) {
      log.error('Error deleting user', error, { userId });
      return false;
    }
  }

  /**
   * Get user count
   * @returns {number} Total number of users
   */
  static getUserCount() {
    try {
      const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
      const result = stmt.get();
      return result.count;
    } catch (error) {
      log.error('Error getting user count', error);
      return 0;
    }
  }
} 