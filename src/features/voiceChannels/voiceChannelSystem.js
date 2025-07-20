import { VoiceChannel, PermissionsBitField } from 'discord.js';
import { logVoiceChannel } from '../../utils/botLogger.js';

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
          id: user.id,
          allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.Connect]
        }
      ]
    });

    await logVoiceChannel(guild.client, 'Created', `${user.tag} (${user.id}) created voice channel "${channel.name}" (${channel.id})`);
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

export const isChannelOwner = (channel, user) => {
  return channel.permissionOverwrites.cache.has(user.id) && 
         channel.permissionOverwrites.cache.get(user.id).allow.has(PermissionsBitField.Flags.ManageChannels);
};

export const deleteVoiceChannel = async (channel) => {
  if (channel instanceof VoiceChannel && channel.members.size === 0) {
    try {
      await logVoiceChannel(channel.client, 'Deleted', `Deleted empty voice channel "${channel.name}" (${channel.id})`);
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
  } catch (error) {
    console.error('Error renaming voice channel:', error);
    throw error;
  }
};

export const lockVoiceChannel = async (channel) => {
  try {
    await channel.permissionOverwrites.edit(channel.guild.id, { [PermissionsBitField.Flags.Connect]: false });
    await logVoiceChannel(channel.client, 'Locked', `${channel.name} (${channel.id}) locked by channel owner`);
  } catch (error) {
    console.error('Error locking voice channel:', error);
    throw error;
  }
};

export const unlockVoiceChannel = async (channel) => {
  try {
    await channel.permissionOverwrites.edit(channel.guild.id, { [PermissionsBitField.Flags.Connect]: null });
    await logVoiceChannel(channel.client, 'Unlocked', `${channel.name} (${channel.id}) unlocked by channel owner`);
  } catch (error) {
    console.error('Error unlocking voice channel:', error);
    throw error;
  }
};

export const limitVoiceChannel = async (channel, userLimit) => {
  try {
    await channel.setUserLimit(userLimit);
    await logVoiceChannel(channel.client, 'Limited', `${channel.name} (${channel.id}) user limit set to ${userLimit} by channel owner`);
  } catch (error) {
    console.error('Error limiting voice channel:', error);
    throw error;
  }
};

export const transferVoiceChannelOwnership = async (channel, newOwner) => {
  try {
    const oldOwner = channel.topic ? channel.topic.split('Owner: ')[1] : 'Unknown';
    await channel.permissionOverwrites.edit(newOwner.id, { [PermissionsBitField.Flags.ManageChannels]: true });
    await channel.setTopic(`Owner: ${newOwner.id}`);
    await logVoiceChannel(channel.client, 'Transferred', `${channel.name} (${channel.id}) ownership transferred from ${oldOwner} to ${newOwner.tag} (${newOwner.id})`);
  } catch (error) {
    console.error('Error transferring voice channel ownership:', error);
    throw error;
  }
}; 