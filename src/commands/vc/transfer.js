import { ApplicationCommandOptionType } from 'discord.js';
import { transferVoiceChannelOwnership, isChannelOwner, getChannelOwnerId } from '../../features/voiceChannels/voiceChannelSystem.js';

export const data = {
  name: 'vc-transfer',
  description: 'Transfers ownership of your voice channel',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.User,
      description: 'The user to transfer ownership to',
      required: true,
    },
  ],
};

export const execute = async (interaction) => {
  const newOwner = interaction.options.getUser('user');
  const channel = interaction.member.voice.channel;
  if (!channel) {
    await interaction.reply({ content: 'You need to be in a voice channel to transfer ownership.', flags: 64 });
    return;
  }
  await channel.fetch();
  await channel.guild.members.fetch();
  await interaction.deferReply({ flags: 64 });
  if (getChannelOwnerId(channel) !== interaction.member.id) {
    await interaction.editReply({ content: '❌ Only the channel owner can use this command.' });
    return;
  }
  await transferVoiceChannelOwnership(channel, newOwner);
  await interaction.editReply({ content: `Voice channel ownership transferred to ${newOwner.username}.` });
}; 