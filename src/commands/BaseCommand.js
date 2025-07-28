import { withMiddleware, requireCommandEnabled, logUsage, deferReply } from '../middleware/commandMiddleware.js';
import { log } from '../utils/logger.js';

export class BaseCommand {
  constructor() {
    this.data = this.getCommandData();
    this.execute = this.wrapExecute(this.execute.bind(this));
  }

  /**
   * Get command data - must be implemented by subclasses
   * @returns {Object} Command data object
   */
  getCommandData() {
    throw new Error('getCommandData() must be implemented by subclass');
  }

  /**
   * Execute command - must be implemented by subclasses
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction
   */
  async execute(interaction) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Wrap execute method with middleware
   * @param {Function} executeFn - The execute function to wrap
   * @returns {Function} Wrapped execute function
   */
  wrapExecute(executeFn) {
    const middlewares = [
      requireCommandEnabled(),
      logUsage(),
      deferReply()
    ];

    // Add custom middlewares if defined
    if (this.getMiddlewares) {
      middlewares.push(...this.getMiddlewares());
    }

    return withMiddleware(executeFn, ...middlewares);
  }

  /**
   * Get custom middlewares - can be overridden by subclasses
   * @returns {Array} Array of middleware functions
   */
  getMiddlewares() {
    return [];
  }

  /**
   * Validate interaction - can be overridden by subclasses
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction
   * @returns {boolean} Whether interaction is valid
   */
  async validateInteraction(interaction) {
    return true;
  }

  /**
   * Handle command success
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction
   * @param {string} message - Success message
   * @param {Object} options - Additional options
   */
  async handleSuccess(interaction, message, options = {}) {
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: message,
          ...options
        });
      } else {
        await interaction.reply({
          content: message,
          ...options
        });
      }
    } catch (error) {
      log.error('Error handling success response', error, {
        commandName: interaction.commandName,
        userId: interaction.user?.id
      });
    }
  }

  /**
   * Handle command error
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction
   * @param {Error} error - Error object
   * @param {string} userMessage - User-friendly error message
   */
  async handleError(interaction, error, userMessage = 'An error occurred while executing this command.') {
    try {
      log.error(`Error in command ${interaction.commandName}`, error, {
        userId: interaction.user?.id,
        guildId: interaction.guild?.id
      });

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ ${userMessage}`,
          flags: 64
        });
      } else {
        await interaction.reply({
          content: `❌ ${userMessage}`,
          flags: 64
        });
      }
    } catch (replyError) {
      log.error('Error sending error response', replyError, {
        commandName: interaction.commandName,
        originalError: error.message
      });
    }
  }

  /**
   * Check if user has required role
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction
   * @param {string|Array<string>} requiredRoles - Required role ID(s)
   * @returns {boolean} Whether user has required role
   */
  hasRequiredRole(interaction, requiredRoles) {
    const memberRoles = interaction.member.roles.cache;
    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    return roles.some(roleId => memberRoles.has(roleId));
  }

  /**
   * Check if user has required permission
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction
   * @param {string|Array<string>} requiredPermissions - Required permission(s)
   * @returns {boolean} Whether user has required permission
   */
  hasRequiredPermission(interaction, requiredPermissions) {
    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    return permissions.every(permission => interaction.member.permissions.has(permission));
  }

  /**
   * Get command usage statistics
   * @returns {Object} Usage statistics
   */
  static getUsageStats() {
    // This could be implemented to track command usage
    return {
      totalUses: 0,
      lastUsed: null,
      averageExecutionTime: 0
    };
  }
}

/**
 * Decorator for creating commands with automatic middleware
 * @param {Object} commandData - Command data
 * @param {Array} middlewares - Additional middlewares
 * @returns {Function} Decorator function
 */
export function Command(commandData, middlewares = []) {
  return function(target) {
    return class extends BaseCommand {
      getCommandData() {
        return commandData;
      }

      getMiddlewares() {
        return middlewares;
      }

      async execute(interaction) {
        return target.prototype.execute.call(this, interaction);
      }
    };
  };
} 