import { featuresConfig, channelsConfig, rolesConfig } from '../config/configLoader.js';
import { log } from '../utils/logger.js';

export class FeatureManager {
  constructor() {
    this.config = featuresConfig();
  }

  /**
   * Check if a feature is enabled
   * @param {string} featureName - Name of the feature to check
   * @returns {boolean} Whether the feature is enabled
   */
  isFeatureEnabled(featureName) {
    const feature = this.config.features[featureName];
    if (!feature) {
      log.warn(`Feature ${featureName} not found in configuration`);
      return false;
    }
    return feature.enabled;
  }

  /**
   * Check if a command is enabled
   * @param {string} commandName - Name of the command to check
   * @returns {boolean} Whether the command is enabled
   */
  isCommandEnabled(commandName) {
    // Search through all command categories
    for (const category of Object.values(this.config.commands)) {
      if (category[commandName]) {
        return category[commandName].enabled;
      }
    }
    log.warn(`Command ${commandName} not found in configuration`);
    return false;
  }

  /**
   * Check if an event is enabled
   * @param {string} eventName - Name of the event to check
   * @returns {boolean} Whether the event is enabled
   */
  isEventEnabled(eventName) {
    const event = this.config.events[eventName];
    if (!event) {
      log.warn(`Event ${eventName} not found in configuration`);
      return false;
    }
    return event.enabled;
  }

  /**
   * Check if a scheduled task is enabled
   * @param {string} taskName - Name of the scheduled task to check
   * @returns {boolean} Whether the task is enabled
   */
  isScheduledTaskEnabled(taskName) {
    const task = this.config.scheduledTasks[taskName];
    if (!task) {
      log.warn(`Scheduled task ${taskName} not found in configuration`);
      return false;
    }
    return task.enabled;
  }

  /**
   * Validate feature requirements
   * @param {string} featureName - Name of the feature to validate
   * @param {import('discord.js').Guild} guild - The guild to validate against
   * @returns {Object} Validation result with success status and missing requirements
   */
  validateFeatureRequirements(featureName, guild) {
    const feature = this.config.features[featureName];
    if (!feature) {
      return { success: false, missing: [`Feature ${featureName} not found`] };
    }

    if (!feature.enabled) {
      return { success: false, missing: [`Feature ${featureName} is disabled`] };
    }

    const missing = [];
    const requires = feature.requires || {};

    // Check channel requirements
    if (requires.channels) {
      for (const channelId of requires.channels) {
        const channel = guild.channels.cache.get(channelsConfig()[channelId]);
        if (!channel) {
          missing.push(`Channel ${channelId} (${channelsConfig()[channelId]}) not found`);
        }
      }
    }

    // Check role requirements
    if (requires.roles) {
      for (const roleId of requires.roles) {
        const roleConfig = rolesConfig()[roleId];
        if (typeof roleConfig === 'object' && roleConfig !== null) {
          // Handle role objects (like levelRoles)
          const roleIds = Object.values(roleConfig);
          let foundAny = false;
          for (const id of roleIds) {
            if (guild.roles.cache.has(id)) {
              foundAny = true;
              break;
            }
          }
          if (!foundAny) {
            missing.push(`Role ${roleId} (${Object.keys(roleConfig)[0]}) not found`);
          }
        } else {
          // Handle single role IDs
          const role = guild.roles.cache.get(roleConfig);
          if (!role) {
            missing.push(`Role ${roleId} (${roleConfig}) not found`);
          }
        }
      }
    }

    // Check permission requirements
    if (requires.permissions) {
      const botMember = guild.members.me;
      for (const permission of requires.permissions) {
        if (!botMember.permissions.has(permission)) {
          missing.push(`Bot missing permission: ${permission}`);
        }
      }
    }

    // Check database requirement
    if (requires.database) {
      // Database is always available in this implementation
      // Could be extended to check database connectivity
    }

    return {
      success: missing.length === 0,
      missing
    };
  }

  /**
   * Validate command requirements
   * @param {string} commandName - Name of the command to validate
   * @param {import('discord.js').Guild} guild - The guild to validate against
   * @returns {Object} Validation result with success status and missing requirements
   */
  validateCommandRequirements(commandName, guild) {
    // Find the command in configuration
    let command = null;
    for (const category of Object.values(this.config.commands)) {
      if (category[commandName]) {
        command = category[commandName];
        break;
      }
    }

    if (!command) {
      return { success: false, missing: [`Command ${commandName} not found`] };
    }

    if (!command.enabled) {
      return { success: false, missing: [`Command ${commandName} is disabled`] };
    }

    const missing = [];
    const requires = command.requires || [];

    // Check feature requirements
    for (const featureName of requires) {
      if (featureName === 'adminRoles' || featureName === 'modRoles' || featureName === 'cnsDeveloperRole') {
        // These are role-based requirements, not feature requirements
        continue;
      }

      if (!this.isFeatureEnabled(featureName)) {
        missing.push(`Required feature ${featureName} is disabled`);
      } else {
        const featureValidation = this.validateFeatureRequirements(featureName, guild);
        if (!featureValidation.success) {
          missing.push(...featureValidation.missing);
        }
      }
    }

    return {
      success: missing.length === 0,
      missing
    };
  }

  /**
   * Get all enabled features
   * @returns {Array} Array of enabled feature names
   */
  getEnabledFeatures() {
    return Object.entries(this.config.features)
      .filter(([_, feature]) => feature.enabled)
      .map(([name, _]) => name);
  }

  /**
   * Get all enabled commands
   * @returns {Array} Array of enabled command names
   */
  getEnabledCommands() {
    const enabledCommands = [];
    for (const [category, commands] of Object.entries(this.config.commands)) {
      for (const [name, command] of Object.entries(commands)) {
        if (command.enabled) {
          enabledCommands.push(name);
        }
      }
    }
    return enabledCommands;
  }

  /**
   * Get all enabled events
   * @returns {Array} Array of enabled event names
   */
  getEnabledEvents() {
    return Object.entries(this.config.events)
      .filter(([_, event]) => event.enabled)
      .map(([name, _]) => name);
  }

  /**
   * Get all enabled scheduled tasks
   * @returns {Array} Array of enabled scheduled task names
   */
  getEnabledScheduledTasks() {
    return Object.entries(this.config.scheduledTasks)
      .filter(([_, task]) => task.enabled)
      .map(([name, _]) => name);
  }

  /**
   * Get feature information
   * @param {string} featureName - Name of the feature
   * @returns {Object|null} Feature information or null if not found
   */
  getFeatureInfo(featureName) {
    return this.config.features[featureName] || null;
  }

  /**
   * Get command information
   * @param {string} commandName - Name of the command
   * @returns {Object|null} Command information or null if not found
   */
  getCommandInfo(commandName) {
    for (const category of Object.values(this.config.commands)) {
      if (category[commandName]) {
        return category[commandName];
      }
    }
    return null;
  }

  /**
   * Get all features that depend on a specific feature
   * @param {string} featureName - Name of the feature to check dependencies for
   * @returns {Array} Array of feature names that depend on the specified feature
   */
  getDependentFeatures(featureName) {
    const dependents = [];
    
    // Check commands that require this feature
    for (const [category, commands] of Object.entries(this.config.commands)) {
      for (const [name, command] of Object.entries(commands)) {
        if (command.requires && Array.isArray(command.requires) && command.requires.includes(featureName)) {
          dependents.push(`command:${name}`);
        }
      }
    }

    // Check events that require this feature
    for (const [name, event] of Object.entries(this.config.events)) {
      if (event.requires && Array.isArray(event.requires) && event.requires.includes(featureName)) {
        dependents.push(`event:${name}`);
      }
    }

    // Check scheduled tasks that require this feature
    for (const [name, task] of Object.entries(this.config.scheduledTasks)) {
      if (task.requires && Array.isArray(task.requires) && task.requires.includes(featureName)) {
        dependents.push(`task:${name}`);
      }
    }

    return dependents;
  }

  /**
   * Log feature status for debugging
   * @param {import('discord.js').Guild} guild - The guild to validate against
   */
  logFeatureStatus(guild) {
    log.info('Feature status report', {
      guildId: guild.id,
      guildName: guild.name,
      enabledFeatures: this.getEnabledFeatures(),
      enabledCommands: this.getEnabledCommands(),
      enabledEvents: this.getEnabledEvents(),
      enabledScheduledTasks: this.getEnabledScheduledTasks()
    });

    // Log validation results for each feature
    for (const featureName of Object.keys(this.config.features)) {
      const validation = this.validateFeatureRequirements(featureName, guild);
      if (!validation.success) {
        log.warn(`Feature ${featureName} validation failed`, {
          featureName,
          missing: validation.missing
        });
      }
    }
  }
}

export default new FeatureManager(); 