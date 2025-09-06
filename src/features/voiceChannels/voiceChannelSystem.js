import { VoiceChannel, PermissionsBitField } from 'discord.js';
import { logVoiceChannel } from '../../utils/botLogger.js';
import { voiceRepoAdapter, voiceOwnership } from '../../repositories/voiceChannelServiceAdapter.js';
import logger from '../../utils/logger.js';

export const createVoiceChannel = async (guild, user) => {
  try {
    const category = guild.channels.cache.get(process.env.VOICE_CATEGORY_ID || '1026537937552298025');
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
          id: guild.members.me.id,
          allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.Connect]
        },
        {
          id: user.id,
          allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.Connect]
        }
      ]
    });

    try { voiceRepoAdapter.setOwner(channel.id, user.id); } catch {}

    await logVoiceChannel(guild.client, 'Created', `${user.tag} (${user.id}) created voice channel "${channel.name}" (${channel.id})`);
    try { voiceRepoAdapter.recordCreate(channel.id, guild.id, user.id, channel.name); } catch {}
    return channel;
  } catch (error) {
    console.error('Error creating voice channel:', error);
    throw error;
  }
};

export const getChannelOwnerId = (channel) => {
  const topic = channel.topic;
  if (topic && topic.includes('Owner: ')) {
    return topic.split('Owner: ')[1];
  }
  return null;
};

export const isChannelOwner = async (channel, user) => {
  try {
    const ownerId = await voiceOwnership.getOwnerId(channel.id);
    if (ownerId && ownerId === user.id) return true;
  } catch {}
  const ow = channel.permissionOverwrites.resolve?.(user.id) || channel.permissionOverwrites.cache.get(user.id);
  return !!(ow && ow.allow?.has(PermissionsBitField.Flags.ManageChannels));
};

export const deleteVoiceChannel = async (channel) => {
  if (channel instanceof VoiceChannel && channel.members.size === 0) {
    try {
      await logVoiceChannel(channel.client, 'Deleted', `Deleted empty voice channel "${channel.name}" (${channel.id})`);
      try { voiceRepoAdapter.recordDelete(channel.id); } catch {}
      await channel.delete('Temporary voice channel cleanup');
    } catch (error) {
      console.error('Error deleting voice channel:', error);
    }
  }
};

export const renameVoiceChannel = async (channel, newName) => {
  try {
    const oldName = channel.name;
    await channel.setName(newName);
    await logVoiceChannel(channel.client, 'Renamed', `${channel.name} (${channel.id}) renamed from "${oldName}" to "${newName}"`);
    try { voiceRepoAdapter.setName(channel.id, newName); } catch {}
  } catch (error) {
    console.error('Error renaming voice channel:', error);
    throw error;
  }
};

export const lockVoiceChannel = async (channel) => {
  try {
    await channel.permissionOverwrites.edit(channel.guild.members.me.id, { [PermissionsBitField.Flags.ManageChannels]: true, [PermissionsBitField.Flags.Connect]: true });
    await channel.permissionOverwrites.edit(channel.guild.id, { [PermissionsBitField.Flags.Connect]: false });
    await logVoiceChannel(channel.client, 'Locked', `${channel.name} (${channel.id}) locked by channel owner`);
    try { voiceRepoAdapter.setLock(channel.id, true); } catch {}
  } catch (error) {
    console.error('Error locking voice channel:', error);
    throw error;
  }
};

export const unlockVoiceChannel = async (channel) => {
  try {
    await channel.permissionOverwrites.edit(channel.guild.members.me.id, { [PermissionsBitField.Flags.ManageChannels]: true, [PermissionsBitField.Flags.Connect]: true });
    await channel.permissionOverwrites.edit(channel.guild.id, { [PermissionsBitField.Flags.Connect]: null });
    await logVoiceChannel(channel.client, 'Unlocked', `${channel.name} (${channel.id}) unlocked by channel owner`);
    try { voiceRepoAdapter.setLock(channel.id, false); } catch {}
  } catch (error) {
    console.error('Error unlocking voice channel:', error);
    throw error;
  }
};

export const limitVoiceChannel = async (channel, userLimit) => {
  try {
    await channel.setUserLimit(userLimit);
    await logVoiceChannel(channel.client, 'Limited', `${channel.name} (${channel.id}) user limit set to ${userLimit} by channel owner`);
    try { voiceRepoAdapter.setLimit(channel.id, userLimit); } catch {}
  } catch (error) {
    console.error('Error limiting voice channel:', error);
    throw error;
  }
};

export const transferVoiceChannelOwnership = async (channel, newOwner) => {
  try {
    const oldOwnerId = await voiceOwnership.getOwnerId(channel.id);
    await channel.permissionOverwrites.edit(newOwner.id, { ManageChannels: true, ViewChannel: true, Connect: true });
    if (oldOwnerId && oldOwnerId !== newOwner.id) {
      try { await channel.permissionOverwrites.edit(oldOwnerId, { ManageChannels: null }); } catch {}
    }
    try { voiceRepoAdapter.setOwner(channel.id, newOwner.id); } catch {}
    await logVoiceChannel(channel.client, 'Transferred', `${channel.name} (${channel.id}) ownership transferred from ${oldOwnerId || 'Unknown'} to ${newOwner.tag} (${newOwner.id})`);
  } catch (error) {
    logger.error({ err: error }, 'Error transferring voice channel ownership');
    throw error;
  }
}; 