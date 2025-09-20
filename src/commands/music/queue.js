import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { buildQueueEmbed } from '../../music/nowPlayingUi.js';
import { loadQueue } from '../../music/queueStore.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'queue',
  description: 'Show the current music queue',
  options: [
    {
      name: 'page',
      type: ApplicationCommandOptionType.Integer,
      description: 'Page number to show (10 tracks per page)',
      required: false,
      min_value: 1
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    const page = (interaction.options.getInteger('page') || 1) - 1;
    const guild = interaction.guild;

    const player = useMainPlayer();
    const node = player.nodes.get(guild.id);

    if (!node || !node.isPlaying()) {
      return await interaction.reply({
        content: '❌ No music is currently playing.',
        flags: 64
      });
    }

    // Get queue from database for consistency
    const dbQueue = loadQueue(guild.id);
    const currentPosition = node.queue.tracks.size > 0 ? 
      node.queue.tracks.findIndex(track => track.url === node.currentTrack?.url) : 0;

    if (dbQueue.length === 0) {
      return await interaction.reply({
        content: '❌ The queue is empty.',
        flags: 64
      });
    }

    const embed = buildQueueEmbed(dbQueue, currentPosition, page);
    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error in queue command');
    await interaction.reply({
      content: '❌ An error occurred while fetching the queue.',
      flags: 64
    });
  }
};
