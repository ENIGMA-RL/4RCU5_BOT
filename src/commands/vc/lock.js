import { lockVoiceChannel, isChannelOwner, getChannelOwnerId } from '../../features/voiceChannels/voiceChannelSystem.js';

export const data = {
  name: 'vc-lock',
  description: 'Locks your voice channel',
};

export const execute = async (interaction) => {
  const channel = interaction.member.voice.channel;
  if (channel) {
    if (getChannelOwnerId(channel) !== interaction.member.id) {
      await interaction.reply({ content: '❌ Only the channel owner can use this command.', ephemeral: true });
      return;
    }
    await lockVoiceChannel(channel);
    await interaction.reply({ content: 'Voice channel locked.', ephemeral: true });
  } else {
    await interaction.reply({ content: 'You need to be in a voice channel to lock it.', ephemeral: true });
  }
}; 