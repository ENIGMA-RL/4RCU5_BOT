import { 
  getUser, 
  createUser, 
  updateUserXP, 
  updateUserLevel, 
  calculateLevel,
  getXPForNextLevel,
  getCurrentLevelXP,
  getTopUsers
} from '../database/db.js';
import { levelSettingsConfig } from '../config/configLoader.js';
import { logRoleChange } from '../utils/botLogger.js';
import { log } from '../utils/logger.js';

export class LevelingService {
  constructor() {
    this.leveling = levelSettingsConfig().leveling;
  }

  /**
   * Award XP to a user for messaging
   * @param {import('discord.js').GuildMember} member - The guild member
   * @returns {Promise<void>}
   */
  async awardMessageXP(member) {
    try {
      const userId = member.id;

      // Get or create user
      let user = getUser(userId);
      if (!user) {
        createUser(userId);
        user = getUser(userId);
      }

      // Calculate new XP and level
      const newXP = user.xp + this.leveling.xpPerMessage;
      const newLevel = calculateLevel(newXP, this.leveling.xpThresholds);

      // Calculate current total level
      const currentTotalXP = user.xp + user.voice_xp;
      const currentTotalLevel = calculateLevel(currentTotalXP, this.leveling.xpThresholds);

      // Update user in database
      updateUserXP(userId, this.leveling.xpPerMessage, 0);
      
      // Calculate new total level
      const newTotalXP = newXP + user.voice_xp;
      const newTotalLevel = calculateLevel(newTotalXP, this.leveling.xpThresholds);
      
      // Check if total level up occurred (this is what matters for role assignment)
      if (newTotalLevel > currentTotalLevel) {
        log.info(`Total level up detected for ${member.user.tag}`, {
          userId,
          oldLevel: currentTotalLevel,
          newLevel: newTotalLevel,
          type: 'message'
        });
        await this.handleLevelUp(member, newLevel, 'message');
      } else if (newLevel > user.level) {
        log.info(`Message level up detected for ${member.user.tag}`, {
          userId,
          oldLevel: user.level,
          newLevel: newLevel,
          type: 'message'
        });
        await this.handleLevelUp(member, newLevel, 'message');
      }

      log.debug(`${member.user.tag} gained ${this.leveling.xpPerMessage} XP`, {
        userId,
        xpGained: this.leveling.xpPerMessage,
        type: 'message'
      });
    } catch (error) {
      log.error('Error awarding message XP', error, { userId: member.id });
      throw error;
    }
  }

  /**
   * Award XP to a user for voice activity
   * @param {import('discord.js').GuildMember} member - The guild member
   * @param {number} xpGain - Amount of XP to award
   * @returns {Promise<void>}
   */
  async awardVoiceXP(member, xpGain) {
    try {
      const userId = member.id;

      // Get or create user
      let user = getUser(userId);
      if (!user) {
        createUser(userId);
        user = getUser(userId);
      }

      // Calculate new voice XP and level
      const newVoiceXP = user.voice_xp + xpGain;
      const newVoiceLevel = calculateLevel(newVoiceXP, this.leveling.xpThresholds);

      // Calculate current total level
      const currentTotalXP = user.xp + user.voice_xp;
      const currentTotalLevel = calculateLevel(currentTotalXP, this.leveling.xpThresholds);

      // Update user in database
      updateUserXP(userId, 0, xpGain);
      
      // Calculate new total level
      const newTotalXP = user.xp + newVoiceXP;
      const newTotalLevel = calculateLevel(newTotalXP, this.leveling.xpThresholds);
      
      // Check if total level up occurred
      if (newTotalLevel > currentTotalLevel) {
        log.info(`Total level up detected for ${member.user.tag}`, {
          userId,
          oldLevel: currentTotalLevel,
          newLevel: newTotalLevel,
          type: 'voice'
        });
        await this.handleLevelUp(member, newVoiceLevel, 'voice');
      } else if (newVoiceLevel > user.voice_level) {
        log.info(`Voice level up detected for ${member.user.tag}`, {
          userId,
          oldLevel: user.voice_level,
          newLevel: newVoiceLevel,
          type: 'voice'
        });
        await this.handleLevelUp(member, newVoiceLevel, 'voice');
      }

      log.debug(`${member.user.tag} gained ${xpGain} voice XP`, {
        userId,
        xpGained: xpGain,
        type: 'voice'
      });
    } catch (error) {
      log.error('Error awarding voice XP', error, { userId: member.id });
      throw error;
    }
  }

  /**
   * Handle level up events
   * @param {import('discord.js').GuildMember} member - The guild member
   * @param {number} newLevel - The new level
   * @param {string} type - Type of level up ('message' or 'voice')
   * @returns {Promise<void>}
   */
  async handleLevelUp(member, newLevel, type) {
    try {
      const userId = member.id;
      const user = getUser(userId);

      // Get current XP (handle missing properties)
      const currentMessageXP = user.xp || 0;
      const currentVoiceXP = user.voice_xp || 0;

      // Calculate total XP and total level
      const totalXP = currentMessageXP + currentVoiceXP;
      const totalLevel = calculateLevel(totalXP, this.leveling.xpThresholds);
      
      log.info(`Level up for ${member.user.tag}`, {
        userId,
        messageXP: currentMessageXP,
        voiceXP: currentVoiceXP,
        totalXP,
        totalLevel,
        type
      });

      // Update levels in database
      if (type === 'message') {
        updateUserLevel(userId, newLevel, user.voice_level || 0, totalLevel);
      } else if (type === 'voice') {
        updateUserLevel(userId, user.level || 0, newLevel, totalLevel);
      }

      // Assign role if applicable (based on total level)
      await this.assignLevelRole(member, totalLevel);

      // Send level up notification if enabled
      if (user.level_up_notifications) {
        await this.sendLevelUpNotification(member, newLevel, type);
      }

      log.info(`${member.user.tag} reached level ${newLevel}`, {
        userId,
        level: newLevel,
        type
      });
    } catch (error) {
      log.error('Error handling level up', error, { userId: member.id });
      throw error;
    }
  }

  /**
   * Assign level role to member
   * @param {import('discord.js').GuildMember} member - The guild member
   * @param {number} totalLevel - The total level
   * @returns {Promise<void>}
   */
  async assignLevelRole(member, totalLevel) {
    try {
      const levelRoles = this.leveling.levelRoles;
      const currentRoles = member.roles.cache;
      
      // Find the highest role the user should have
      let highestRoleId = null;
      for (const [level, roleId] of Object.entries(levelRoles)) {
        if (totalLevel >= parseInt(level) && roleId) {
          highestRoleId = roleId;
        }
      }

      // Remove roles above current level
      for (const [level, roleId] of Object.entries(levelRoles)) {
        if (parseInt(level) > totalLevel && currentRoles.has(roleId)) {
          await member.roles.remove(roleId, `Level ${totalLevel} reached - removing level ${level} role`);
          await logRoleChange(member.client, member.id, member.user.tag, 'Removed', `Level ${level} role (now level ${totalLevel})`);
          log.info(`Removed level ${level} role from ${member.user.tag}`, {
            userId: member.id,
            roleId,
            reason: `Level ${totalLevel} reached`
          });
        }
      }

      // Add the highest appropriate role if user doesn't have it
      if (highestRoleId && !currentRoles.has(highestRoleId)) {
        await member.roles.add(highestRoleId, `Level ${totalLevel} reached`);
        await logRoleChange(member.client, member.id, member.user.tag, 'Added', `Level ${totalLevel} role`);
        log.info(`Added level role to ${member.user.tag}`, {
          userId: member.id,
          roleId: highestRoleId,
          level: totalLevel
        });
      }
    } catch (error) {
      log.error('Error assigning level role', error, { userId: member.id });
      throw error;
    }
  }

  /**
   * Send level up notification to user
   * @param {import('discord.js').GuildMember} member - The guild member
   * @param {number} newLevel - The new level
   * @param {string} type - Type of level up
   * @returns {Promise<void>}
   */
  async sendLevelUpNotification(member, newLevel, type) {
    try {
      const embed = {
        title: '🎉 Level Up!',
        description: `Congratulations ${member}! You've reached **Level ${newLevel}**!`,
        color: 0x00ff00,
        timestamp: new Date().toISOString()
      };

      await member.send({ embeds: [embed] });
      log.debug(`Sent level up notification to ${member.user.tag}`, {
        userId: member.id,
        level: newLevel,
        type
      });
    } catch (error) {
      log.warn('Failed to send level up notification', {
        userId: member.id,
        error: error.message
      });
    }
  }

  /**
   * Get user's level information
   * @param {string} userId - The user ID
   * @returns {Object} User's level information
   */
  getUserLevelInfo(userId) {
    const user = getUser(userId);
    if (!user) return null;

    const totalXP = user.xp + user.voice_xp;
    const totalLevel = calculateLevel(totalXP, this.leveling.xpThresholds);
    const nextLevelXP = getXPForNextLevel(totalXP, this.leveling.xpThresholds);
    const currentLevelXP = getCurrentLevelXP(totalXP, this.leveling.xpThresholds);

    return {
      messageXP: user.xp,
      voiceXP: user.voice_xp,
      totalXP,
      messageLevel: user.level,
      voiceLevel: user.voice_level,
      totalLevel,
      nextLevelXP,
      currentLevelXP,
      levelUpNotifications: user.level_up_notifications
    };
  }

  /**
   * Get top users leaderboard
   * @param {number} limit - Number of users to return
   * @returns {Array} Array of top users
   */
  getTopUsers(limit = 10) {
    return getTopUsers(limit);
  }
}

export default new LevelingService(); 