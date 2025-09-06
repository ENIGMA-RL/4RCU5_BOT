import { lockVoiceChannel, isChannelOwner } from '../../features/voiceChannels/voiceChannelSystem.js';

export const data = {
  name: 'vc-lock',
  description: 'Locks your voice channel',
};

export const execute = async (interaction) => {
  const channel = interaction.member.voice.channel;
  if (channel) {
    const fresh = await channel.fetch();
    if (!(await isChannelOwner(fresh, interaction.member))) {
      await interaction.reply({ content: '❌ Only the channel owner can use this command.', flags: 64 });
      return;
    }
    await lockVoiceChannel(channel);
    await interaction.reply({ content: 'Voice channel locked.', flags: 64 });
  } else {
    await interaction.reply({ content: 'You need to be in a voice channel to lock it.', flags: 64 });
  }
}; 