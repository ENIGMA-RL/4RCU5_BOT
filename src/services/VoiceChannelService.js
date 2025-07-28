import { PermissionsBitField } from 'discord.js';
import { logVoiceChannel } from '../utils/botLogger.js';
import { log } from '../utils/logger.js';

import { channelsConfig } from '../config/configLoader.js';

export class VoiceChannelService {
  constructor() {
    this.voiceCategoryId = channelsConfig().voiceCategoryId;
  }

  /**
   * Create a temporary voice channel for a user
   * @param {import('discord.js').Guild} guild - The guild
   * @param {import('discord.js').User} user - The user creating the channel
   * @returns {Promise<import('discord.js').VoiceChannel>}
   */
  async createVoiceChannel(guild, user) {
    try {
      const category = guild.channels.cache.get(this.voiceCategoryId);
      if (!category) {
        throw new Error(`Voice category with ID ${this.voiceCategoryId} not found`);
      }

      const channel = await guild.channels.create({
        name: `${user.username}'s Channel`,
        type: 2, // Voice channel
        parent: category,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.Connect]
          },
          {
            id: user.id,
            allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.Connect]
          }
        ]
      });

      await logVoiceChannel(guild.client, 'Created', `${user.tag} (${user.id}) created voice channel "${channel.name}" (${channel.id})`);
      
      log.info(`Voice channel created`, {
        channelId: channel.id,
        channelName: channel.name,
        userId: user.id,
        guildId: guild.id
      });

      return channel;
    } catch (error) {
      log.error('Error creating voice channel', error, {
        userId: user.id,
        guildId: guild.id
      });
      throw error;
    }
  }

  /**
   * Delete a voice channel
   * @param {import('discord.js').VoiceChannel} channel - The channel to delete
   * @param {string} reason - Reason for deletion
   * @returns {Promise<void>}
   */
  async deleteVoiceChannel(channel, reason = 'No longer needed') {
    try {
      await channel.delete(reason);
      
      log.info(`Voice channel deleted`, {
        channelId: channel.id,
        channelName: channel.name,
        reason
      });
    } catch (error) {
      log.error('Error deleting voice channel', error, {
        channelId: channel.id
      });
      throw error;
    }
  }

  /**
   * Lock a voice channel
   * @param {import('discord.js').VoiceChannel} channel - The channel to lock
   * @param {import('discord.js').User} user - The user performing the action
   * @returns {Promise<void>}
   */
  async lockChannel(channel, user) {
    try {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        Connect: false
      });

      log.info(`Voice channel locked`, {
        channelId: channel.id,
        channelName: channel.name,
        userId: user.id
      });
    } catch (error) {
      log.error('Error locking voice channel', error, {
        channelId: channel.id,
        userId: user.id
      });
      throw error;
    }
  }

  /**
   * Unlock a voice channel
   * @param {import('discord.js').VoiceChannel} channel - The channel to unlock
   * @param {import('discord.js').User} user - The user performing the action
   * @returns {Promise<void>}
   */
  async unlockChannel(channel, user) {
    try {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        Connect: null
      });

      log.info(`Voice channel unlocked`, {
        channelId: channel.id,
        channelName: channel.name,
        userId: user.id
      });
    } catch (error) {
      log.error('Error unlocking voice channel', error, {
        channelId: channel.id,
        userId: user.id
      });
      throw error;
    }
  }

  /**
   * Set user limit on a voice channel
   * @param {import('discord.js').VoiceChannel} channel - The channel to limit
   * @param {number} limit - The user limit
   * @param {import('discord.js').User} user - The user performing the action
   * @returns {Promise<void>}
   */
  async setUserLimit(channel, limit, user) {
    try {
      await channel.setUserLimit(limit);

      log.info(`Voice channel user limit set`, {
        channelId: channel.id,
        channelName: channel.name,
        limit,
        userId: user.id
      });
    } catch (error) {
      log.error('Error setting voice channel user limit', error, {
        channelId: channel.id,
        limit,
        userId: user.id
      });
      throw error;
    }
  }

  /**
   * Rename a voice channel
   * @param {import('discord.js').VoiceChannel} channel - The channel to rename
   * @param {string} newName - The new name
   * @param {import('discord.js').User} user - The user performing the action
   * @returns {Promise<void>}
   */
  async renameChannel(channel, newName, user) {
    try {
      const oldName = channel.name;
      await channel.setName(newName);

      log.info(`Voice channel renamed`, {
        channelId: channel.id,
        oldName,
        newName,
        userId: user.id
      });
    } catch (error) {
      log.error('Error renaming voice channel', error, {
        channelId: channel.id,
        newName,
        userId: user.id
      });
      throw error;
    }
  }

  /**
   * Transfer ownership of a voice channel
   * @param {import('discord.js').VoiceChannel} channel - The channel to transfer
   * @param {import('discord.js').User} newOwner - The new owner
   * @param {import('discord.js').User} currentOwner - The current owner
   * @returns {Promise<void>}
   */
  async transferOwnership(channel, newOwner, currentOwner) {
    try {
      // Remove permissions from current owner
      await channel.permissionOverwrites.edit(currentOwner.id, {
        ManageChannels: null,
        Connect: null
      });

      // Add permissions to new owner
      await channel.permissionOverwrites.edit(newOwner.id, {
        ManageChannels: true,
        Connect: true
      });

      log.info(`Voice channel ownership transferred`, {
        channelId: channel.id,
        channelName: channel.name,
        fromUserId: currentOwner.id,
        toUserId: newOwner.id
      });
    } catch (error) {
      log.error('Error transferring voice channel ownership', error, {
        channelId: channel.id,
        fromUserId: currentOwner.id,
        toUserId: newOwner.id
      });
      throw error;
    }
  }

  /**
   * Allow a user to join a voice channel
   * @param {import('discord.js').VoiceChannel} channel - The channel
   * @param {import('discord.js').User} targetUser - The user to allow
   * @param {import('discord.js').User} owner - The channel owner
   * @returns {Promise<void>}
   */
  async allowUser(channel, targetUser, owner) {
    try {
      await channel.permissionOverwrites.edit(targetUser.id, {
        Connect: true
      });

      log.info(`User allowed to join voice channel`, {
        channelId: channel.id,
        channelName: channel.name,
        targetUserId: targetUser.id,
        ownerId: owner.id
      });
    } catch (error) {
      log.error('Error allowing user to join voice channel', error, {
        channelId: channel.id,
        targetUserId: targetUser.id,
        ownerId: owner.id
      });
      throw error;
    }
  }

  /**
   * Check if a user is the owner of a voice channel
   * @param {import('discord.js').VoiceChannel} channel - The channel to check
   * @param {import('discord.js').User} user - The user to check
   * @returns {boolean}
   */
  isChannelOwner(channel, user) {
    const permissions = channel.permissionOverwrites.cache.get(user.id);
    return permissions?.allow.has(PermissionsBitField.Flags.ManageChannels) || false;
  }

  /**
   * Get all temporary voice channels in the guild
   * @param {import('discord.js').Guild} guild - The guild
   * @returns {Array<import('discord.js').VoiceChannel>}
   */
  getTemporaryChannels(guild) {
    const category = guild.channels.cache.get(this.voiceCategoryId);
    if (!category) return [];

    return category.children.cache.filter(channel => 
      channel.type === 2 && // Voice channel
      channel.name.includes("'s Channel")
    );
  }

  /**
   * Clean up empty temporary channels
   * @param {import('discord.js').Guild} guild - The guild
   * @returns {Promise<number>} Number of channels cleaned up
   */
  async cleanupEmptyChannels(guild) {
    try {
      const temporaryChannels = this.getTemporaryChannels(guild);
      let cleanedCount = 0;

      for (const channel of temporaryChannels.values()) {
        if (channel.members.size === 0) {
          await this.deleteVoiceChannel(channel, 'Empty temporary channel cleanup');
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        log.info(`Cleaned up ${cleanedCount} empty temporary voice channels`, {
          guildId: guild.id,
          cleanedCount
        });
      }

      return cleanedCount;
    } catch (error) {
      log.error('Error cleaning up empty voice channels', error, {
        guildId: guild.id
      });
      throw error;
    }
  }
}

export default new VoiceChannelService(); 