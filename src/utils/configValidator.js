import { z } from 'zod';
import { log } from './logger.js';

// Schema definitions
const ChannelSchema = z.object({
  welcomeChannelId: z.string().min(1),
  generalChannelId: z.string().min(1),
  modLogChannelId: z.string().min(1),
  botLogChannelId: z.string().min(1),
  levelCheckChannelId: z.string().min(1),
  statsChannelId: z.string().min(1),
  staffChannelId: z.string().min(1),
  rulesChannelId: z.string().min(1),
  joinToCreateChannelId: z.string().min(1),
  voiceCategoryId: z.string().min(1),
  botTestChannelId: z.string().min(1)
});

const BotSchema = z.object({
  prefix: z.string().min(1),
  ownerID: z.string().min(1),
  botRole: z.string().min(1)
});

const RolesSchema = z.object({
  adminRoles: z.array(z.string().min(1)),
  modRoles: z.array(z.string().min(1)),
  memberRoles: z.array(z.string().min(1)),
  sayCommandRoles: z.array(z.string().min(1)),
  autoAssignRoles: z.array(z.string().min(1)),
  helperRole: z.string().min(1),
  cnsDeveloperRole: z.string().min(1),
  tagGuildId: z.string().min(1),
  cnsOfficialRole: z.string().min(1),
  cnsSpecialMemberRole: z.string().min(1),
  staffRole: z.string().min(1),
  levelRoles: z.record(z.string().min(1)),
  commandPermissions: z.object({
    admin: z.array(z.string()),
    mod: z.array(z.string()),
    member: z.array(z.string())
  }),
  cnsRole: z.string().min(1),
  cnsNewcomerRole: z.string().min(1),
  birthdayRole: z.string().min(1)
});

const LevelSettingsSchema = z.object({
  leveling: z.object({
    xpPerMessage: z.number().min(1),
    xpPerMinuteVoice: z.number().min(0),
    xpThresholds: z.record(z.number().min(1)),
    levelUpRoles: z.record(z.string().min(1)),
    roleAssignments: z.record(z.string().min(1)),
    rolePersistence: z.boolean()
  })
});

const StaffSchema = z.object({
  staffRoles: z.array(z.object({
    name: z.string().min(1),
    roleId: z.string().min(1),
    color: z.string().regex(/^#[0-9A-F]{6}$/i),
    description: z.string().optional()
  })),
  staffEmbedTitle: z.string().min(1),
  staffEmbedColor: z.string().regex(/^#[0-9A-F]{6}$/i),
  updateInterval: z.number().min(1000)
});

const VCSettingsSchema = z.object({
  maxChannels: z.number().min(1).max(50),
  channelTimeout: z.number().min(30000),
  allowRenaming: z.boolean(),
  allowLimiting: z.boolean(),
  allowLocking: z.boolean()
});

const FeaturesSchema = z.object({
  features: z.record(z.object({
    enabled: z.boolean(),
    description: z.string().min(1),
    requires: z.object({
      channels: z.array(z.string()).optional(),
      roles: z.array(z.string()).optional(),
      permissions: z.array(z.string()).optional(),
      database: z.boolean().optional()
    }).optional()
  })),
  commands: z.record(z.record(z.object({
    enabled: z.boolean(),
    description: z.string().min(1),
    category: z.string().min(1),
    requires: z.array(z.string()).optional()
  }))),
  events: z.record(z.object({
    enabled: z.boolean(),
    description: z.string().min(1),
    requires: z.array(z.string()).optional()
  })),
  scheduledTasks: z.record(z.object({
    enabled: z.boolean(),
    description: z.string().min(1),
    interval: z.number().min(1000),
    requires: z.array(z.string()).optional()
  }))
});

export class ConfigValidator {
  constructor() {
    this.schemas = {
      channels: ChannelSchema,
      bot: BotSchema,
      roles: RolesSchema,
      levelSettings: LevelSettingsSchema,
      staff: StaffSchema,
      vcSettings: VCSettingsSchema,
      features: FeaturesSchema
    };
    
    this.validationResults = new Map();
  }

  /**
   * Validate a specific configuration file
   * @param {string} configName - Name of the config file
   * @param {Object} configData - Configuration data to validate
   * @returns {Object} Validation result
   */
  validateConfig(configName, configData) {
    try {
      const schema = this.schemas[configName];
      if (!schema) {
        return {
          valid: false,
          errors: [`Unknown configuration type: ${configName}`]
        };
      }

      const result = schema.safeParse(configData);
      
      if (result.success) {
        return {
          valid: true,
          warnings: this.generateWarnings(configName, configData)
        };
      } else {
        return {
          valid: false,
          errors: result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
        };
      }
    } catch (error) {
      log.error(`Error validating ${configName} config`, error);
      return {
        valid: false,
        errors: [`Validation error: ${error.message}`]
      };
    }
  }

  /**
   * Validate all configuration files
   * @param {Object} configs - Object containing all config data
   * @returns {Object} Overall validation result
   */
  validateAllConfigs(configs) {
    const results = {};
    let allValid = true;
    const allErrors = [];
    const allWarnings = [];

    for (const [configName, configData] of Object.entries(configs)) {
      const result = this.validateConfig(configName, configData);
      results[configName] = result;
      
      if (!result.valid) {
        allValid = false;
        allErrors.push(...result.errors.map(err => `${configName}: ${err}`));
      }
      
      if (result.warnings) {
        allWarnings.push(...result.warnings.map(warn => `${configName}: ${warn}`));
      }
    }

    // Cross-reference validation
    const crossRefErrors = this.validateCrossReferences(configs);
    allErrors.push(...crossRefErrors);

    this.validationResults = new Map(Object.entries(results));

    return {
      valid: allValid && crossRefErrors.length === 0,
      results,
      errors: allErrors,
      warnings: allWarnings
    };
  }

  /**
   * Validate cross-references between configs
   * @param {Object} configs - All configuration data
   * @returns {Array} Array of cross-reference errors
   */
  validateCrossReferences(configs) {
    const errors = [];
    
    // Check if channel IDs in features config exist in channels config
    if (configs.features && configs.channels) {
      const channelIds = new Set(Object.values(configs.channels));
      
      for (const [featureName, feature] of Object.entries(configs.features.features)) {
        if (feature.requires?.channels) {
          for (const channelId of feature.requires.channels) {
            if (!channelIds.has(channelId)) {
              errors.push(`Feature '${featureName}' references non-existent channel ID: ${channelId}`);
            }
          }
        }
      }
    }

    // Check if role IDs in features config exist in roles config
    if (configs.features && configs.roles) {
      const roleIds = new Set([
        ...configs.roles.adminRoles,
        ...configs.roles.modRoles,
        ...configs.roles.memberRoles,
        ...configs.roles.sayCommandRoles,
        ...configs.roles.autoAssignRoles,
        configs.roles.helperRole,
        configs.roles.cnsDeveloperRole,
        configs.roles.tagGuildId,
        configs.roles.cnsOfficialRole,
        configs.roles.cnsSpecialMemberRole,
        configs.roles.staffRole,
        configs.roles.cnsRole,
        configs.roles.cnsNewcomerRole,
        configs.roles.birthdayRole,
        ...Object.values(configs.roles.levelRoles)
      ]);

      for (const [featureName, feature] of Object.entries(configs.features.features)) {
        if (feature.requires?.roles) {
          for (const roleId of feature.requires.roles) {
            if (!roleIds.has(roleId)) {
              errors.push(`Feature '${featureName}' references non-existent role ID: ${roleId}`);
            }
          }
        }
      }
    }

    // Check if command requirements reference valid features
    if (configs.features) {
      const featureNames = new Set(Object.keys(configs.features.features));
      
      for (const [category, commands] of Object.entries(configs.features.commands)) {
        for (const [commandName, command] of Object.entries(commands)) {
          if (command.requires) {
            for (const requirement of command.requires) {
              if (!featureNames.has(requirement) && 
                  !['adminRoles', 'modRoles', 'cnsDeveloperRole'].includes(requirement)) {
                errors.push(`Command '${commandName}' references non-existent feature: ${requirement}`);
              }
            }
          }
        }
      }
    }

    return errors;
  }

  /**
   * Generate warnings for configuration
   * @param {string} configName - Name of the config
   * @param {Object} configData - Configuration data
   * @returns {Array} Array of warnings
   */
  generateWarnings(configName, configData) {
    const warnings = [];

    switch (configName) {
      case 'channels':
        // Check for duplicate channel IDs
        const channelIds = Object.values(configData);
        const duplicates = channelIds.filter((id, index) => channelIds.indexOf(id) !== index);
        if (duplicates.length > 0) {
          warnings.push(`Duplicate channel IDs found: ${duplicates.join(', ')}`);
        }
        break;

      case 'roles':
        // Check for duplicate role IDs
        const roleIds = [
          ...configData.adminRoles,
          ...configData.modRoles,
          ...configData.memberRoles,
          configData.helperRole,
          configData.cnsDeveloperRole,
          configData.cnsOfficialRole,
          configData.cnsSpecialMemberRole,
          configData.staffRole,
          configData.cnsRole,
          configData.cnsNewcomerRole,
          configData.birthdayRole,
          ...Object.values(configData.levelRoles)
        ];
        const duplicateRoles = roleIds.filter((id, index) => roleIds.indexOf(id) !== index);
        if (duplicateRoles.length > 0) {
          warnings.push(`Duplicate role IDs found: ${duplicateRoles.join(', ')}`);
        }
        break;

      case 'levelSettings':
        // Check for missing role assignments
        const levelNumbers = Object.keys(configData.leveling.xpThresholds).map(Number);
        const maxLevel = Math.max(...levelNumbers);
        
        for (let i = 1; i <= maxLevel; i++) {
          if (!configData.leveling.roleAssignments[i.toString()]) {
            warnings.push(`Level ${i} has no role assignment`);
          }
        }
        break;

      case 'features':
        // Check for disabled features that have dependent commands
        const disabledFeatures = Object.entries(configData.features)
          .filter(([_, feature]) => !feature.enabled)
          .map(([name, _]) => name);

        for (const [category, commands] of Object.entries(configData.commands)) {
          for (const [commandName, command] of Object.entries(commands)) {
            if (command.enabled && command.requires) {
              for (const requirement of command.requires) {
                if (disabledFeatures.includes(requirement)) {
                  warnings.push(`Command '${commandName}' is enabled but depends on disabled feature '${requirement}'`);
                }
              }
            }
          }
        }
        break;
    }

    return warnings;
  }

  /**
   * Get validation results for a specific config
   * @param {string} configName - Name of the config
   * @returns {Object|null} Validation result
   */
  getValidationResult(configName) {
    return this.validationResults.get(configName) || null;
  }

  /**
   * Get all validation results
   * @returns {Object} All validation results
   */
  getAllValidationResults() {
    return Object.fromEntries(this.validationResults);
  }

  /**
   * Check if all configs are valid
   * @returns {boolean} Whether all configs are valid
   */
  areAllConfigsValid() {
    return Array.from(this.validationResults.values()).every(result => result.valid);
  }

  /**
   * Get summary of validation issues
   * @returns {Object} Summary of validation issues
   */
  getValidationSummary() {
    const summary = {
      total: this.validationResults.size,
      valid: 0,
      invalid: 0,
      totalErrors: 0,
      totalWarnings: 0,
      configs: {}
    };

    for (const [configName, result] of this.validationResults) {
      summary.configs[configName] = {
        valid: result.valid,
        errorCount: result.errors ? result.errors.length : 0,
        warningCount: result.warnings ? result.warnings.length : 0
      };

      if (result.valid) {
        summary.valid++;
      } else {
        summary.invalid++;
      }

      summary.totalErrors += result.errors ? result.errors.length : 0;
      summary.totalWarnings += result.warnings ? result.warnings.length : 0;
    }

    return summary;
  }
}

export default new ConfigValidator(); 