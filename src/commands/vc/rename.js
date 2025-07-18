import { ApplicationCommandOptionType } from 'discord.js';
import { renameVoiceChannel, isChannelOwner, getChannelOwnerId } from '../../features/voiceChannels/voiceChannelSystem.js';

export const data = {
  name: 'vc-rename',
  description: 'Renames your voice channel',
  options: [
    {
      name: 'name',
      type: ApplicationCommandOptionType.String,
      description: 'The new name for the voice channel',
      required: true,
    },
  ],
};

export const execute = async (interaction) => {
  const newName = interaction.options.getString('name');
  const channel = interaction.member.voice.channel;
  if (channel) {
    if (getChannelOwnerId(channel) !== interaction.member.id) {
      await interaction.reply({ content: '❌ Only the channel owner can use this command.', ephemeral: true });
      return;
    }
    await renameVoiceChannel(channel, newName);
    await interaction.reply({ content: `Voice channel renamed to ${newName}.`, ephemeral: true });
  } else {
    await interaction.reply({ content: 'You need to be in a voice channel to rename it.', ephemeral: true });
  }
}; 