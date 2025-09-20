import { EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import logger from '../../utils/logger.js';

export const data = {
  name: 'back',
  description: 'Go back to the previous track',
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

    if (node.queue.history.size === 0) {
      return await interaction.reply({
        content: '❌ There are no previous tracks to go back to.',
        flags: 64
      });
    }

    const previousTrack = node.queue.history.previous;
    node.history.back();

    const embed = new EmbedBuilder()
      .setTitle('⏮️ Went Back')
      .setDescription(`Went back to **${previousTrack.title}**`)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error in back command');
    await interaction.reply({
      content: '❌ An error occurred while trying to go back.',
      flags: 64
    });
  }
};
