import { EmbedBuilder } from 'discord.js';
import { channelsConfig } from '../config/configLoader.js';

export const logModerationAction = async (client, action, targetUser, moderator, reason, duration = null) => {
  try {
    // Get the guild using GUILD_ID from environment
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      console.error(`Guild with ID ${process.env.GUILD_ID} not found in client cache`);
      console.log('Available guilds:', client.guilds.cache.map(g => `${g.name} (${g.id})`));
      return;
    }

    console.log(`🔍 Attempting to fetch mod log channel ${channelsConfig().modLogChannelId} from guild ${guild.name} (${guild.id})`);
    
    const logChannel = await guild.channels.fetch(channelsConfig().modLogChannelId).catch((error) => {
      console.error(`❌ Failed to fetch mod log channel: ${error.message}`);
      return null;
    });
    
    if (!logChannel) {
      console.error(`Moderation log channel ${channelsConfig().modLogChannelId} not found in guild ${guild.name}`);
      return;
    }

    // Create embed for log channel
    const embed = new EmbedBuilder()
      .setTitle(`🛡️ ${action}`)
      .setColor(getActionColor(action))
      .addFields(
        { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: '🛡️ Moderator', value: `${moderator.tag} (${moderator.id})`, inline: true },
        { name: '📝 Reason', value: reason || 'No reason provided', inline: false }
      )
      .setTimestamp();

    if (duration) {
      embed.addFields({ name: '⏱️ Duration', value: formatDuration(duration), inline: true });
    }

    // Send to log channel
    await logChannel.send({ embeds: [embed] });

    // Send DM to affected user (except for unban since they're not in the server)
    if (action.toLowerCase() !== 'unban') {
      await sendModerationDM(targetUser, action, reason, duration, guild.name);
    }

  } catch (error) {
    console.error('Error logging moderation action:', error);
  }
};

export const logRoleAssignment = async (client, member, role, assignedBy = null) => {
  try {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) return;

    const logChannel = await guild.channels.fetch(channelsConfig().modLogChannelId).catch(() => null);
    if (!logChannel) {
      console.error(`Log channel ${channelsConfig().modLogChannelId} not found in guild ${guild.name}`);
      return;
    }

    // Create embed for role assignment
    const embed = new EmbedBuilder()
      .setTitle('🎭 Role Assignment')
      .setColor('#00ff00') // Green for role assignments
      .addFields(
        { name: '👤 User', value: `${member.user.tag} (${member.id})`, inline: true },
        { name: '🎭 Role', value: `${role.name} (${role.id})`, inline: true },
        { name: '📝 Assigned By', value: assignedBy ? `${assignedBy.tag} (${assignedBy.id})` : 'Auto-assignment (Welcome)', inline: true }
      )
      .setTimestamp();

    // Send to log channel
    await logChannel.send({ embeds: [embed] });

  } catch (error) {
    console.error('Error logging role assignment:', error);
  }
};

// Helper function to get color based on action
function getActionColor(action) {
  const actionLower = action.toLowerCase();
  switch (actionLower) {
    case 'ban':
      return 0xff0000; // Red
    case 'unban':
      return 0x00ff00; // Green
    case 'kick':
      return 0xff8800; // Orange
    case 'timeout':
      return 0xffaa00; // Yellow
    case 'untimeout':
      return 0x00ff00; // Green
    case 'warn':
      return 0xffff00; // Yellow
    default:
      return 0x0099ff; // Blue
  }
}

// Helper function to format duration
function formatDuration(duration) {
  if (!duration || duration <= 0) return 'Permanent';
  
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day(s)`;
  if (hours > 0) return `${hours} hour(s)`;
  if (minutes > 0) return `${minutes} minute(s)`;
  return `${seconds} second(s)`;
}

const sendModerationDM = async (user, action, reason, duration, guildName) => {
  try {
    const embed = new EmbedBuilder()
      .setTitle(`You have been ${action.toLowerCase()}ed`)
      .setColor(getActionColor(action))
      .setDescription(`You have been ${action.toLowerCase()}ed from **${guildName}**`)
      .addFields(
        { name: '📝 Reason', value: reason || 'No reason provided', inline: false }
      )
      .setTimestamp();

    if (duration && duration > 0) {
      embed.addFields({ name: '⏱️ Duration', value: formatDuration(duration), inline: false });
    }

    if (action.toLowerCase() === 'ban') {
      embed.addFields({ name: 'ℹ️ Information', value: 'You have been permanently banned from this server. If you believe this was a mistake, please contact a server administrator.', inline: false });
    } else if (action.toLowerCase() === 'timeout') {
      embed.addFields({ name: 'ℹ️ Information', value: 'You have been timed out. You will be able to send messages again once the timeout expires.', inline: false });
    } else if (action.toLowerCase() === 'untimeout') {
      embed.setTitle('Your timeout has been removed');
      embed.setDescription(`Your timeout has been removed from **${guildName}**`);
      embed.addFields({ name: 'ℹ️ Information', value: 'You can now send messages again.', inline: false });
    }

    await user.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Could not send DM to ${user.tag}:`, error.message);
  }
}; 