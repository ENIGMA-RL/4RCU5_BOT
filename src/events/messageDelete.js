import { EmbedBuilder } from 'discord.js';
import { channelsConfig, rolesConfig } from '../config/configLoader.js';

export const name = 'messageDelete';
export const execute = async (message) => {
  console.log(`[DEBUG] messageDelete event triggered for message by ${message.author?.tag || 'Unknown'}`);
  
  try {
    // Ignore if message is from a bot or doesn't have a guild
    if (message.author?.bot || !message.guild) {
      console.log(`[DEBUG] Skipping: ${message.author?.bot ? 'Bot message' : 'No guild'}`);
      return;
    }

    // Ignore if message was deleted by the author themselves
    if (message.author.id === message.client.user.id) {
      console.log(`[DEBUG] Skipping: Self-deletion by bot`);
      return;
    }

    console.log(`[DEBUG] Fetching audit logs for message deletion...`);
    
    // Get the audit logs to see who deleted the message
    const auditLogs = await message.guild.fetchAuditLogs({
      type: 'MESSAGE_DELETE',
      limit: 1,
    }).catch((error) => {
      console.error(`[DEBUG] Error fetching audit logs:`, error);
      return null;
    });

    if (!auditLogs) {
      console.log(`[DEBUG] No audit logs found`);
      return;
    }

    const deletionLog = auditLogs.entries.first();
    if (!deletionLog) {
      console.log(`[DEBUG] No deletion log entry found`);
      return;
    }

    console.log(`[DEBUG] Deletion log found: executor=${deletionLog.executor?.tag}, target=${deletionLog.target?.tag}`);

    // Check if the deletion happened recently (within last 5 seconds)
    const timeDiff = Date.now() - deletionLog.createdTimestamp;
    if (timeDiff > 5000) {
      console.log(`[DEBUG] Deletion too old: ${timeDiff}ms ago`);
      return;
    }

    const executor = deletionLog.executor;
    const targetMessage = deletionLog.target;

    // Ignore if the executor is the same as the message author (self-deletion)
    if (executor.id === message.author.id) {
      console.log(`[DEBUG] Skipping: Self-deletion by user`);
      return;
    }

    // Ignore if the executor is a bot
    if (executor.bot) {
      console.log(`[DEBUG] Skipping: Deletion by bot`);
      return;
    }

    console.log(`[DEBUG] Checking permissions for executor: ${executor.tag}`);

    // Check if executor has message management permissions
    const member = await message.guild.members.fetch(executor.id).catch(() => null);
    if (!member) {
      console.log(`[DEBUG] Could not fetch member: ${executor.id}`);
      return;
    }

    const hasManageMessages = member.permissions.has('ManageMessages');
    const hasAdminRole = rolesConfig().adminRoles.some(roleId => member.roles.cache.has(roleId));
    const hasModRole = rolesConfig().modRoles?.some(roleId => member.roles.cache.has(roleId)) || false;

    console.log(`[DEBUG] Permissions: ManageMessages=${hasManageMessages}, Admin=${hasAdminRole}, Mod=${hasModRole}`);

    // Only log if they have proper permissions
    if (!hasManageMessages && !hasAdminRole && !hasModRole) {
      console.log(`[DEBUG] Skipping: No proper permissions`);
      return;
    }

    // Ignore if this was likely a bot command (purge, etc.)
    // Check if multiple messages were deleted around the same time
    const recentDeletions = auditLogs.entries.filter(entry => 
      entry.action === 'MESSAGE_DELETE' && 
      Date.now() - entry.createdTimestamp < 1000
    );

    if (recentDeletions.size > 3) {
      console.log(`[DEBUG] Skipping: Likely bulk deletion (${recentDeletions.size} recent)`);
      return;
    }

    console.log(`[DEBUG] Logging message deletion...`);

    // Log the message deletion
    await logMessageDeletion(message, executor);

  } catch (error) {
    console.error('Error in messageDelete event:', error);
  }
};

async function logMessageDeletion(message, executor) {
  try {
    console.log(`[DEBUG] logMessageDeletion called for message by ${message.author?.tag}`);
    
    const guild = message.guild;
    console.log(`[DEBUG] Guild: ${guild.name} (${guild.id})`);
    
    const logChannel = await guild.channels.fetch(channelsConfig().modLogChannelId).catch((error) => {
      console.error(`[DEBUG] Error fetching log channel:`, error);
      return null;
    });
    
    if (!logChannel) {
      console.error(`[DEBUG] Moderation log channel ${channelsConfig().modLogChannelId} not found`);
      return;
    }

    console.log(`[DEBUG] Log channel found: ${logChannel.name} (${logChannel.id})`);

    // Create embed for message deletion log
    const embed = new EmbedBuilder()
      .setTitle('🗑️ Message Deleted')
      .setColor(0xff8800) // Orange for deletions
      .addFields(
        { name: '👤 Author', value: `${message.author.tag} (${message.author.id})`, inline: true },
        { name: '🛡️ Deleted By', value: `${executor.tag} (${executor.id})`, inline: true },
        { name: '📝 Channel', value: `${message.channel} (${message.channel.id})`, inline: true },
        { name: '🕐 Deleted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: '4RCU5', iconURL: message.client.user.displayAvatarURL() });

    // Add message content if it exists and isn't too long
    if (message.content && message.content.length > 0) {
      const content = message.content.length > 1024 
        ? message.content.substring(0, 1021) + '...' 
        : message.content;
      
      embed.addFields({
        name: '💬 Message Content',
        value: content || '*No text content*',
        inline: false
      });
    }

    // Add attachment info if message had attachments
    if (message.attachments.size > 0) {
      const attachmentList = Array.from(message.attachments.values())
        .map(attachment => `• ${attachment.name} (${attachment.url})`)
        .join('\n');
      
      embed.addFields({
        name: '📎 Attachments',
        value: attachmentList,
        inline: false
      });
    }

    // Add embed info if message had embeds
    if (message.embeds.length > 0) {
      embed.addFields({
        name: '🔗 Embeds',
        value: `Message contained ${message.embeds.length} embed(s)`,
        inline: false
      });
    }

    console.log(`[DEBUG] Sending embed to log channel...`);
    await logChannel.send({ embeds: [embed] });
    console.log(`[DEBUG] Message deletion logged successfully!`);

  } catch (error) {
    console.error('Error logging message deletion:', error);
  }
} 