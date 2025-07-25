import { channelsConfig } from '../config/configLoader.js';

export const logBotAction = async (client, action, details) => {
  try {
    // Get the guild using GUILD_ID from environment
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      console.error(`Guild with ID ${process.env.GUILD_ID} not found in client cache`);
      console.log('Available guilds:', client.guilds.cache.map(g => `${g.name} (${g.id})`));
      return;
    }

    console.log(`🔍 Attempting to fetch bot log channel ${channelsConfig().botLogChannelId} from guild ${guild.name} (${guild.id})`);
    
    const logChannel = await guild.channels.fetch(channelsConfig().botLogChannelId).catch((error) => {
      console.error(`❌ Failed to fetch bot log channel: ${error.message}`);
      return null;
    });
    
    if (!logChannel) {
      console.error(`Bot log channel ${channelsConfig().botLogChannelId} not found in guild ${guild.name}`);
      return;
    }

    const logMessage = `${action}: ${details}`;

    await logChannel.send(logMessage);

  } catch (error) {
    console.error('Error logging bot action:', error);
  }
};

// Convenience functions for common bot actions
export const logRoleChange = async (client, userId, username, action, roleName, reason) => {
  await logBotAction(client, 'Role Change', `${action} role "${roleName}" for <@${userId}> - ${reason}`);
};

export const logLevelUp = async (client, userId, username, oldLevel, newLevel, xpType) => {
  await logBotAction(client, 'Level Up', `<@${userId}> reached level ${newLevel} in ${xpType} (was ${oldLevel})`);
};

export const logInviteBlock = async (client, userId, username, channelName) => {
  await logBotAction(client, 'Invite Block', `Blocked Discord invite from <@${userId}> in #${channelName}`);
};

export const logMemberJoin = async (client, userId, username) => {
  await logBotAction(client, 'Member Join', `<@${userId}> joined the server`);
};

export const logMemberLeave = async (client, userId, username) => {
  await logBotAction(client, 'Member Leave', `<@${userId}> left the server`);
};

export const logTagSync = async (client, userId, username, action, reason) => {
  await logBotAction(client, 'Tag Sync', `${action} CNS Official role for <@${userId}> - ${reason}`);
};

export const logVoiceChannel = async (client, action, details) => {
  await logBotAction(client, `Voice Channel ${action}`, details);
};

// Debug function to help identify guild-channel mismatches
export const debugGuildChannels = async (client) => {
  console.log('🔍 Debugging guild-channel relationships...');
  console.log(`Environment GUILD_ID: ${process.env.GUILD_ID}`);
  
  for (const guild of client.guilds.cache.values()) {
    console.log(`\n📋 Guild: ${guild.name} (${guild.id})`);
    
    // Check if this guild has any of our configured channels
    const channels = [
      { name: 'botLog', id: channelsConfig().botLogChannelId },
      { name: 'modLog', id: channelsConfig().modLogChannelId },
      { name: 'levelCheck', id: channelsConfig().levelCheckChannelId },
      { name: 'stats', id: channelsConfig().statsChannelId },
      { name: 'staff', id: channelsConfig().staffChannelId }
    ];
    
    for (const channel of channels) {
      try {
        const foundChannel = await guild.channels.fetch(channel.id).catch(() => null);
        if (foundChannel) {
          console.log(`  ✅ ${channel.name}: ${foundChannel.name} (${channel.id})`);
        }
      } catch (error) {
        // Channel not in this guild
      }
    }
  }
}; 