import { EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import logger from '../../utils/logger.js';

export const data = {
  name: 'pause',
  description: 'Pause the current track',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    const guild = interaction.guild;
    const member = interaction.member;

    const player = useMainPlayer();
    const node = player.nodes.get(guild.id);

    if (!node || !node.isPlaying()) {
      return await interaction.reply({
        content: '❌ No music is currently playing.',
        flags: 64
      });
    }

    // Check if user is in the same voice channel
    if (member.voice.channelId !== node.connection?.joinConfig?.channelId) {
      return await interaction.reply({
        content: '❌ You need to be in the same voice channel as the bot to control playback.',
        flags: 64
      });
    }

    if (node.isPaused && node.isPaused()) {
      return await interaction.reply({
        content: '❌ The music is already paused.',
        flags: 64
      });
    }

    node.pause();

    const embed = new EmbedBuilder()
      .setTitle('⏸️ Music Paused')
      .setDescription(`Paused **${node.currentTrack.title}**`)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error in pause command');
    await interaction.reply({
      content: '❌ An error occurred while trying to pause the music.',
      flags: 64
    });
  }
};
