import { EmbedBuilder } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';
import featureManager from '../../services/FeatureManager.js';
import { log } from '../../utils/logger.js';

export const data = {
  name: 'features',
  description: 'View and manage bot features (Admin only)',
  options: [
    {
      name: 'action',
      description: 'What action to perform',
      type: 3, // STRING
      required: false,
      choices: [
        {
          name: 'List Features',
          value: 'list'
        },
        {
          name: 'Check Status',
          value: 'status'
        },
        {
          name: 'Validate Requirements',
          value: 'validate'
        }
      ]
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    // Check if user has admin role
    const memberRoles = interaction.member.roles.cache;
    const isAdmin = rolesConfig().adminRoles.some(roleId => memberRoles.has(roleId));
    
    if (!isAdmin) {
      await interaction.reply({
        content: '❌ You need admin permissions to use this command.',
        flags: 64
      });
      return;
    }

    const action = interaction.options.getString('action') || 'list';

    switch (action) {
      case 'list':
        await listFeatures(interaction);
        break;
      case 'status':
        await checkStatus(interaction);
        break;
      case 'validate':
        await validateRequirements(interaction);
        break;
      default:
        await interaction.reply({
          content: '❌ Invalid action specified.',
          flags: 64
        });
    }
  } catch (error) {
    log.error('Error in features command', error, {
      userId: interaction.user?.id,
      guildId: interaction.guild?.id,
      action: interaction.options.getString('action')
    });
    await interaction.reply({
      content: '❌ An error occurred while processing the command.',
      flags: 64
    });
  }
};

async function listFeatures(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🤖 Bot Features')
    .setDescription('Current feature status and configuration')
    .setColor('#00ff00')
    .setTimestamp();

  const enabledFeatures = featureManager.getEnabledFeatures();
  const disabledFeatures = Object.keys(featureManager.config.features).filter(
    feature => !enabledFeatures.includes(feature)
  );

  if (enabledFeatures.length > 0) {
    embed.addFields({
      name: '✅ Enabled Features',
      value: enabledFeatures.map(feature => {
        const info = featureManager.getFeatureInfo(feature);
        return `**${feature}** - ${info?.description || 'No description'}`;
      }).join('\n'),
      inline: false
    });
  }

  if (disabledFeatures.length > 0) {
    embed.addFields({
      name: '❌ Disabled Features',
      value: disabledFeatures.map(feature => {
        const info = featureManager.getFeatureInfo(feature);
        return `**${feature}** - ${info?.description || 'No description'}`;
      }).join('\n'),
      inline: false
    });
  }

  embed.addFields({
    name: '📊 Summary',
    value: `**${enabledFeatures.length}** enabled, **${disabledFeatures.length}** disabled`,
    inline: false
  });

  await interaction.reply({ embeds: [embed] });
}

async function checkStatus(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Bot Status Report')
    .setDescription('Detailed status of all bot components')
    .setColor('#0099ff')
    .setTimestamp();

  // Features status
  const enabledFeatures = featureManager.getEnabledFeatures();
  embed.addFields({
    name: '🎯 Features',
    value: `**${enabledFeatures.length}** enabled features`,
    inline: true
  });

  // Commands status
  const enabledCommands = featureManager.getEnabledCommands();
  embed.addFields({
    name: '⚡ Commands',
    value: `**${enabledCommands.length}** enabled commands`,
    inline: true
  });

  // Events status
  const enabledEvents = featureManager.getEnabledEvents();
  embed.addFields({
    name: '📡 Events',
    value: `**${enabledEvents.length}** enabled events`,
    inline: true
  });

  // Scheduled tasks status
  const enabledTasks = featureManager.getEnabledScheduledTasks();
  embed.addFields({
    name: '⏰ Scheduled Tasks',
    value: `**${enabledTasks.length}** enabled tasks`,
    inline: true
  });

  await interaction.reply({ embeds: [embed] });
}

async function validateRequirements(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🔍 Requirements Validation')
    .setDescription('Checking feature requirements against current server setup')
    .setColor('#ff9900')
    .setTimestamp();

  const issues = [];
  const validFeatures = [];

  // Validate each feature
  for (const featureName of Object.keys(featureManager.config.features)) {
    const validation = featureManager.validateFeatureRequirements(featureName, interaction.guild);
    
    if (validation.success) {
      validFeatures.push(featureName);
    } else {
      issues.push(`**${featureName}**: ${validation.missing.join(', ')}`);
    }
  }

  if (validFeatures.length > 0) {
    embed.addFields({
      name: '✅ Valid Features',
      value: validFeatures.join(', '),
      inline: false
    });
  }

  if (issues.length > 0) {
    embed.addFields({
      name: '❌ Issues Found',
      value: issues.slice(0, 10).join('\n') + (issues.length > 10 ? '\n... and more' : ''),
      inline: false
    });
  }

  embed.addFields({
    name: '📊 Summary',
    value: `**${validFeatures.length}** valid, **${issues.length}** issues`,
    inline: false
  });

  await interaction.reply({ embeds: [embed] });
} 