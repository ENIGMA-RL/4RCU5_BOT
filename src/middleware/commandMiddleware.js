import { rolesConfig, channelsConfig } from '../config/configLoader.js';
import { handleInteractionError } from '../utils/errorHandler.js';
import { log } from '../utils/logger.js';
import featureManager from '../services/FeatureManager.js';

/**
 * Middleware to check if user has required role
 * @param {string|Array<string>} requiredRoles - Role ID(s) required
 * @returns {Function} Middleware function
 */
export const requireRole = (requiredRoles) => {
  return async (interaction, next) => {
    try {
      const memberRoles = interaction.member.roles.cache;
      const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
      
      const hasRequiredRole = roles.some(roleId => memberRoles.has(roleId));
      
      if (!hasRequiredRole) {
        const roleNames = roles.map(roleId => {
          const role = interaction.guild.roles.cache.get(roleId);
          return role ? role.name : roleId;
        });
        
        await interaction.reply({
          content: `❌ You need one of these roles to use this command: ${roleNames.join(', ')}`,
          flags: 64
        });
        return;
      }
      
      await next();
    } catch (error) {
      await handleInteractionError(interaction, error, { middleware: 'requireRole' });
    }
  };
};

/**
 * Middleware to check if command is used in required channel
 * @param {string} requiredChannelId - Channel ID where command is allowed
 * @param {boolean} allowTestChannel - Whether to allow bot test channel
 * @returns {Function} Middleware function
 */
export const requireChannel = (requiredChannelId, allowTestChannel = true) => {
  return async (interaction, next) => {
    try {
      const isTestChannel = allowTestChannel && 
        interaction.channelId === channelsConfig().botTestChannelId;
      const isRequiredChannel = interaction.channelId === requiredChannelId;
      
      if (!isTestChannel && !isRequiredChannel) {
        await interaction.reply({
          content: `❌ This command can only be used in <#${requiredChannelId}>`,
          flags: 64
        });
        return;
      }
      
      await next();
    } catch (error) {
      await handleInteractionError(interaction, error, { middleware: 'requireChannel' });
    }
  };
};

/**
 * Middleware to defer reply automatically
 * @returns {Function} Middleware function
 */
export const deferReply = () => {
  return async (interaction, next) => {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: 64 });
      }
      await next();
    } catch (error) {
      await handleInteractionError(interaction, error, { middleware: 'deferReply' });
    }
  };
};

/**
 * Middleware to check if user is bot owner
 * @returns {Function} Middleware function
 */
export const requireBotOwner = () => {
  return async (interaction, next) => {
    try {
      const { botConfig } = await import('../config/configLoader.js');
      const isOwner = interaction.user.id === botConfig().ownerID;
      
      if (!isOwner) {
        await interaction.reply({
          content: '❌ Only the bot owner can use this command.',
          flags: 64
        });
        return;
      }
      
      await next();
    } catch (error) {
      await handleInteractionError(interaction, error, { middleware: 'requireBotOwner' });
    }
  };
};

/**
 * Middleware to check if user has admin permissions
 * @returns {Function} Middleware function
 */
export const requireAdmin = () => {
  return async (interaction, next) => {
    try {
      const adminRoles = rolesConfig().adminRoles;
      const memberRoles = interaction.member.roles.cache;
      const hasAdminRole = memberRoles.some(role => adminRoles.includes(role.id));
      
      if (!hasAdminRole) {
        await interaction.reply({
          content: '❌ You need administrator permissions to use this command.',
          flags: 64
        });
        return;
      }
      
      await next();
    } catch (error) {
      await handleInteractionError(interaction, error, { middleware: 'requireAdmin' });
    }
  };
};

/**
 * Middleware to add rate limiting
 * @param {number} cooldownMs - Cooldown in milliseconds
 * @returns {Function} Middleware function
 */
export const rateLimit = (cooldownMs = 5000) => {
  const cooldowns = new Map();
  
  return async (interaction, next) => {
    try {
      const userId = interaction.user.id;
      const now = Date.now();
      const lastUsed = cooldowns.get(userId) || 0;
      
      if (now - lastUsed < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
        await interaction.reply({
          content: `⏳ Please wait ${remaining} seconds before using this command again.`,
          flags: 64
        });
        return;
      }
      
      cooldowns.set(userId, now);
      await next();
    } catch (error) {
      await handleInteractionError(interaction, error, { middleware: 'rateLimit' });
    }
  };
};

/**
 * Middleware to log command usage
 * @returns {Function} Middleware function
 */
export const logUsage = () => {
  return async (interaction, next) => {
    const startTime = Date.now();
    
    try {
      log.info(`Command executed`, {
        command: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
        channelId: interaction.channelId
      });
      
      await next();
      
      const duration = Date.now() - startTime;
      log.debug(`Command completed`, {
        command: interaction.commandName,
        userId: interaction.user.id,
        duration: `${duration}ms`
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log.error(`Command failed`, error, {
        command: interaction.commandName,
        userId: interaction.user.id,
        duration: `${duration}ms`
      });
      throw error;
    }
  };
};

/**
 * Compose multiple middleware functions
 * @param {...Function} middlewares - Middleware functions to compose
 * @returns {Function} Composed middleware function
 */
export const compose = (...middlewares) => {
  return async (interaction, finalHandler) => {
    let index = 0;
    
    const next = async () => {
      if (index >= middlewares.length) {
        return await finalHandler(interaction);
      }
      
      const middleware = middlewares[index++];
      return await middleware(interaction, next);
    };
    
    return await next();
  };
};

/**
 * Middleware to check if a command is enabled
 * @returns {Function} Middleware function
 */
export const requireCommandEnabled = () => {
  return async (interaction, next) => {
    try {
      const commandName = interaction.commandName;
      
      if (!featureManager.isCommandEnabled(commandName)) {
        await interaction.reply({
          content: '❌ This command is currently disabled.',
          flags: 64
        });
        return;
      }

      // Validate command requirements
      const validation = featureManager.validateCommandRequirements(commandName, interaction.guild);
      if (!validation.success) {
        log.warn(`Command ${commandName} requirements not met`, {
          commandName,
          guildId: interaction.guild?.id,
          missing: validation.missing
        });
        
        await interaction.reply({
          content: '❌ This command is not available due to missing requirements.',
          flags: 64
        });
        return;
      }

      await next();
    } catch (error) {
      await handleInteractionError(interaction, error, { middleware: 'requireCommandEnabled' });
    }
  };
};

/**
 * Apply middleware to a command handler
 * @param {Function} handler - The command handler function
 * @param {...Function} middlewares - Middleware functions to apply
 * @returns {Function} Wrapped command handler
 */
export const withMiddleware = (handler, ...middlewares) => {
  const composed = compose(...middlewares);
  
  return async (interaction) => {
    try {
      await composed(interaction, handler);
    } catch (error) {
      await handleInteractionError(interaction, error, { 
        command: interaction.commandName,
        middlewares: middlewares.map(m => m.name || 'anonymous')
      });
    }
  };
}; 