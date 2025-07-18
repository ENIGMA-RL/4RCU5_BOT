import { VoiceChannel, PermissionsBitField } from 'discord.js';

export const createVoiceChannel = async (guild, user) => {
  const channel = await guild.channels.create(`VC-${user.username}`, {
    type: 'GUILD_VOICE',
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.ManageChannels],
      },
    ],
  });
  return channel;
};

export const getChannelOwnerId = (channel) => {
  const owners = Array.from(channel.members.values())
    .filter(member => !member.user.bot && channel.permissionsFor(member)?.has(PermissionsBitField.Flags.ManageChannels));
  return owners.length === 1 ? owners[0].id : null;
};

export const isChannelOwner = (channel, userId) => {
  return getChannelOwnerId(channel) === userId;
};

export const deleteVoiceChannel = async (channel) => {
  if (channel instanceof VoiceChannel && channel.members.size === 0) {
    await channel.delete();
  }
};

export const renameVoiceChannel = async (channel, newName) => {
  await channel.setName(newName);
};

export const lockVoiceChannel = async (channel) => {
  await channel.permissionOverwrites.edit(channel.guild.id, { [PermissionsBitField.Flags.Connect]: false });
};

export const unlockVoiceChannel = async (channel) => {
  await channel.permissionOverwrites.edit(channel.guild.id, { [PermissionsBitField.Flags.Connect]: true });
};

export const limitVoiceChannel = async (channel, userLimit) => {
  await channel.setUserLimit(userLimit);
};

export const transferVoiceChannelOwnership = async (channel, newOwner) => {
  // Remove MANAGE_CHANNELS from all members before assigning to the new owner
  for (const [id, overwrite] of channel.permissionOverwrites.cache) {
    if (overwrite.type === 'member') {
      await channel.permissionOverwrites.edit(id, { [PermissionsBitField.Flags.ManageChannels]: null });
    }
  }
  // Deny MANAGE_CHANNELS for @everyone
  await channel.permissionOverwrites.edit(channel.guild.id, { [PermissionsBitField.Flags.ManageChannels]: false });
  await new Promise(res => setTimeout(res, 500));
  // Grant MANAGE_CHANNELS to the new owner only
  await channel.permissionOverwrites.edit(newOwner.id, { [PermissionsBitField.Flags.ManageChannels]: true });
}; 