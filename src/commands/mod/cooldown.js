import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { set as cdSet } from '../../services/CooldownService.js';
import { commandCooldownsConfig, channelsConfig, staffConfig } from '../../config/configLoader.js';
import { getCooldownCommandChoices, parseDuration } from '../../utils/cooldownCommandHelper.js';
import { setCooldownDuration, getCooldownDuration } from '../../utils/cooldownStorage.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'cooldown',
  description: 'Set cooldown for a command (Admin/Founder/Dev only)',
  options: [
    {
      name: 'command',
      type: ApplicationCommandOptionType.String,
      description: 'Command to set cooldown for',
      required: true,
      choices: [
        { name: 'rank', value: 'rank' },
        { name: 'leaderboard', value: 'leaderboard' }
      ]
    },
    {
      name: 'duration',
      type: ApplicationCommandOptionType.String,
      description: 'Duration (e.g., "30m", "2h", "1d")',
      required: true
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    // Check if user has staff role (excluding Helper and Mod)
    const staffRoles = staffConfig().staffRoles
      .filter(role => role.name !== 'CNS Helper' && role.name !== 'CNS Mod')
      .map(role => role.id);
    const memberRoles = interaction.member.roles.cache.map(role => role.id);
    const hasStaffRole = memberRoles.some(roleId => staffRoles.includes(roleId));
    
    if (!hasStaffRole) {
      await interaction.reply({
        content: '❌ You do not have permission to use this command.',
        flags: 64
      });
      return;
    }

    const command = interaction.options.getString('command');
    const duration = interaction.options.getString('duration');
    const cooldownConfig = commandCooldownsConfig();
    
    if (!cooldownConfig.commands?.[command]) {
      await interaction.reply({
        content: `❌ Command "${command}" is not configured for cooldowns.`,
        flags: 64
      });
      return;
    }


    
          try {
        const durationMs = parseDuration(duration);
        const durationMinutes = Math.floor(durationMs / (1000 * 60));
        
        // Set the persistent cooldown duration for the command
        setCooldownDuration(command, durationMinutes, interaction.user.tag);
        
        // Also set a test cooldown for the user
        cdSet(interaction.member, command);
        
        await interaction.reply({
          content: `⏰ Cooldown set for **${command}** (${durationMinutes} minutes). This will persist across bot restarts.`,
          flags: 64
        });

        // Log the action
        await logCooldownAction(interaction, command, durationMinutes);
      } catch (error) {
      await interaction.reply({
        content: `❌ ${error.message}`,
        flags: 64
      });
    }

  } catch (error) {
    logger.error({ err: error }, 'Error in cooldown command');
    await interaction.reply({
      content: '❌ An error occurred while executing this command.',
      flags: 64
    });
  }
};

/**
 * Log cooldown actions to mod-log channel
 * @param {Object} interaction - Discord interaction object
 * @param {string} command - Command that had cooldown set
 * @param {number} durationMinutes - Duration in minutes
 */
async function logCooldownAction(interaction, command, durationMinutes) {
  try {
    const modLogChannel = interaction.client.channels.cache.get(channelsConfig().modLogChannelId);
    if (modLogChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('⏰ Cooldown Set')
        .setDescription(`**Command:** ${command}\n**Duration:** ${durationMinutes} minutes\n**Set by:** ${interaction.user.tag} (${interaction.user.id})`)
        .setTimestamp()
        .setFooter({ text: 'Cooldown Management' });

      await modLogChannel.send({ embeds: [logEmbed] });
    }
  } catch (logError) {
    logger.error({ err: logError }, 'Failed to log cooldown action');
  }
} 