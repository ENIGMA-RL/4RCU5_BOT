import { ApplicationCommandOptionType } from 'discord.js';
import { limitVoiceChannel, isChannelOwner, getChannelOwnerId } from '../../features/voiceChannels/voiceChannelSystem.js';

export const data = {
  name: 'vc-limit',
  description: 'Sets a user limit on your voice channel',
  options: [
    {
      name: 'limit',
      type: ApplicationCommandOptionType.Integer,
      description: 'The user limit for the voice channel',
      required: true,
    },
  ],
};

export const execute = async (interaction) => {
  const userLimit = interaction.options.getInteger('limit');
  const channel = interaction.member.voice.channel;
  if (channel) {
    if (getChannelOwnerId(channel) !== interaction.member.id) {
      await interaction.reply({ content: '❌ Only the channel owner can use this command.', ephemeral: true });
      return;
    }
    await limitVoiceChannel(channel, userLimit);
    await interaction.reply({ content: `Voice channel user limit set to ${userLimit}.`, ephemeral: true });
  } else {
    await interaction.reply({ content: 'You need to be in a voice channel to set a limit.', ephemeral: true });
  }
}; 