import { ApplicationCommandOptionType, PermissionsBitField } from 'discord.js';
import { isChannelOwner, getChannelOwnerId } from '../../features/voiceChannels/voiceChannelSystem.js';

export const data = {
  name: 'vc-allow',
  description: 'Allow a user to join your locked voice channel',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.User,
      description: 'The user to allow',
      required: true,
    },
  ],
};

export const execute = async (interaction) => {
  const channel = interaction.member.voice.channel;
  const user = interaction.options.getUser('user');
  if (!channel) {
    await interaction.reply({ content: 'You need to be in a voice channel to use this command.', ephemeral: true });
    return;
  }
  if (getChannelOwnerId(channel) !== interaction.member.id) {
    await interaction.reply({ content: '❌ Only the channel owner can use this command.', ephemeral: true });
    return;
  }
  await channel.permissionOverwrites.edit(user.id, { [PermissionsBitField.Flags.Connect]: true });
  await interaction.reply({ content: `✅ ${user.username} is now allowed to join your channel.`, ephemeral: true });
}; 