import { ApplicationCommandOptionType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { staffConfig, channelsConfig } from '../../config/configLoader.js';

export const data = {
  name: 'slowmode',
  description: 'Set slowmode for the current channel (Admin/Founder/Dev only)',
  options: [
    {
      name: 'duration',
      type: ApplicationCommandOptionType.String,
      description: 'Slowmode duration (e.g., "5s", "30m", "2h", "1d") or "off" to disable',
      required: true
    }
  ],
  defaultMemberPermissions: '0'
};

/**
 * Parse duration string to seconds (e.g., "5s", "30m", "2h", "1d")
 * @param {string} durationStr - Duration string to parse
 * @returns {number} Duration in seconds
 * @throws {Error} If duration format is invalid
 */
function parseSlowmodeDuration(durationStr) {
  if (durationStr.toLowerCase() === 'off' || durationStr === '0') {
    return 0;
  }
  
  const match = durationStr.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error('Invalid duration format. Use format like "5s", "30m", "2h", "1d" or "off" to disable');
  }
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value; // seconds
    case 'm': return value * 60; // minutes to seconds
    case 'h': return value * 60 * 60; // hours to seconds
    case 'd': return value * 24 * 60 * 60; // days to seconds
    default: throw new Error('Invalid time unit. Use s (seconds), m (minutes), h (hours), or d (days)');
  }
}

/**
 * Format duration in seconds to human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
function formatSlowmodeDuration(seconds) {
  if (seconds === 0) return 'off';
  
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

export const execute = async (interaction) => {
  try {
    // Check if user has staff role (excluding Helper)
    const staffRoles = staffConfig().staffRoles
      .filter(role => role.name !== 'CNS Helper')
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

    // Check if user has manage channels permission
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: '❌ You need the "Manage Channels" permission to use this command.',
        flags: 64
      });
      return;
    }

    const durationStr = interaction.options.getString('duration');
    const channel = interaction.channel;

    try {
      const slowmodeSeconds = parseSlowmodeDuration(durationStr);
      
      // Discord slowmode limit is 21600 seconds (6 hours)
      if (slowmodeSeconds > 21600) {
        await interaction.reply({
          content: '❌ Slowmode cannot exceed 6 hours (21600 seconds).',
          flags: 64
        });
        return;
      }

      // Set the slowmode
      await channel.setRateLimitPerUser(slowmodeSeconds);
      
      const formattedDuration = formatSlowmodeDuration(slowmodeSeconds);
      const status = slowmodeSeconds === 0 ? 'disabled' : `set to **${formattedDuration}**`;
      
      await interaction.reply({
        content: `✅ Slowmode ${status} for <#${channel.id}>`,
        flags: 64
      });

      // Log the action to mod-log channel
      try {
        const modLogChannel = interaction.client.channels.cache.get(channelsConfig().modLogChannelId);
        if (modLogChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor(slowmodeSeconds === 0 ? '#00ff00' : '#ff9900')
            .setTitle('🕐 Slowmode Updated')
            .setDescription(`**Channel:** <#${channel.id}>\n**Action:** ${status}\n**Set by:** ${interaction.user.tag} (${interaction.user.id})`)
            .setTimestamp()
            .setFooter({ text: 'Slowmode Management' });

          await modLogChannel.send({ embeds: [logEmbed] });
        }
      } catch (logError) {
        console.error('Failed to log slowmode action:', logError);
      }

    } catch (error) {
      await interaction.reply({
        content: `❌ ${error.message}`,
        flags: 64
      });
    }

  } catch (error) {
    console.error('Error in slowmode command:', error);
    await interaction.reply({
      content: '❌ An error occurred while setting slowmode.',
      flags: 64
    });
  }
}; 