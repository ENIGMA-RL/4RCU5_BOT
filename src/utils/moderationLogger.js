import { EmbedBuilder } from 'discord.js';
import channelsConfig from '../config/channels.json' with { type: 'json' };

export const logModerationAction = async (client, action, targetUser, moderator, reason, duration = null) => {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const logChannel = await guild.channels.fetch(channelsConfig.logChannelId);
    if (!logChannel) {
      // Only log error if log channel is missing
      console.error('Log channel not found');
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
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const logChannel = guild.channels.cache.get(channelsConfig.logChannelId);
    if (!logChannel) {
      console.error('Log channel not found');
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

const getActionColor = (action) => {
  switch (action.toLowerCase()) {
    case 'kick':
      return '#ffa500'; // Orange
    case 'ban':
      return '#ff0000'; // Red
    case 'timeout':
      return '#ffff00'; // Yellow
    case 'untimeout':
      return '#00ff00'; // Green
    case 'unban':
      return '#00ff00'; // Green
    default:
      return '#0099ff'; // Blue
  }
};

const formatDuration = (minutes) => {
  if (minutes === 0) return 'Indefinitely';
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hours`;
  return `${Math.floor(minutes / 1440)} days`;
};

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