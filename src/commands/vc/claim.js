import { PermissionsBitField } from 'discord.js';
import { getChannelOwnerId } from '../../features/voiceChannels/voiceChannelSystem.js';

export const data = {
  name: 'vc-claim',
  description: 'Claim ownership of your current voice channel if the owner has left',
};

export const execute = async (interaction) => {
  const channel = interaction.member.voice.channel;
  if (!channel) {
    await interaction.reply({ content: 'You need to be in a voice channel to claim ownership.', flags: 64 });
    return;
  }
  await channel.fetch();
  await channel.guild.members.fetch();
  await interaction.deferReply({ flags: 64 });
  // Prevent claiming if there is already an owner
  if (getChannelOwnerId(channel)) {
    await interaction.editReply({ content: 'This channel already has an active owner.' });
    return;
  }
  // Remove MANAGE_CHANNELS from all users with a permission overwrite (set both allow and deny to null)
  for (const [id, overwrite] of channel.permissionOverwrites.cache) {
    if (overwrite.type === 'member') {
      await channel.permissionOverwrites.edit(id, {
        [PermissionsBitField.Flags.ManageChannels]: null
      });
    }
  }
  // Deny MANAGE_CHANNELS for @everyone
  await channel.permissionOverwrites.edit(channel.guild.id, { [PermissionsBitField.Flags.ManageChannels]: false });
  await new Promise(res => setTimeout(res, 500));
  await channel.fetch();
  // Grant MANAGE_CHANNELS to the claimer only
  await channel.permissionOverwrites.edit(interaction.member.id, { [PermissionsBitField.Flags.ManageChannels]: true });
  await new Promise(res => setTimeout(res, 500));
  await channel.fetch();
  await interaction.editReply({ content: '✅ You have claimed ownership of this channel.' });
}; 