import { EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { shuffleQueue, saveQueue } from '../../music/queueStore.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'shuffle',
  description: 'Shuffle the music queue',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    const guild = interaction.guild;
    const member = interaction.member;

    const player = useMainPlayer();
    const node = player.nodes.get(guild.id);

    if (!node || node.queue.tracks.size === 0) {
      return await interaction.reply({
        content: '❌ The queue is empty.',
        flags: 64
      });
    }

    // Check if user is in the same voice channel
    if (member.voice.channelId !== node.connection?.joinConfig?.channelId) {
      return await interaction.reply({
        content: '❌ You need to be in the same voice channel as the bot to shuffle the queue.',
        flags: 64
      });
    }

    // Shuffle the queue
    node.queue.tracks.shuffle();
    
    // Update database
    const queueTracks = node.queue.tracks.map(track => ({
      title: track.title,
      url: track.url,
      source: track.source,
      duration: track.duration,
      requestedBy: track.requestedBy,
      thumbnail: track.thumbnail
    }));
    saveQueue(guild.id, queueTracks);

    const embed = new EmbedBuilder()
      .setTitle('🔀 Queue Shuffled')
      .setDescription(`Shuffled **${node.queue.tracks.size}** tracks in the queue.`)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error in shuffle command');
    await interaction.reply({
      content: '❌ An error occurred while trying to shuffle the queue.',
      flags: 64
    });
  }
};
