import { channelsConfig } from '../config/configLoader.js';

export const logBotAction = async (client, action, details) => {
  try {
    // Get the first guild from the client (or use a specific guild ID if needed)
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('No guild found in client cache');
      return;
    }

    const logChannel = await guild.channels.fetch(channelsConfig().botLogChannelId);
    if (!logChannel) {
      console.error('Bot log channel not found');
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