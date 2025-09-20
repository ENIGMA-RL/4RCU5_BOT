import { EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { addToQueue, saveQueue } from '../../music/queueStore.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'addprevious',
  description: 'Add the previous track back to the queue',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    const guild = interaction.guild;
    const member = interaction.member;

    const player = useMainPlayer();
    const node = player.nodes.get(guild.id);

    if (!node) {
      return await interaction.reply({
        content: '❌ No music player is active.',
        flags: 64
      });
    }

    // Check if user is in the same voice channel
    if (member.voice.channelId !== node.connection?.joinConfig?.channelId) {
      return await interaction.reply({
        content: '❌ You need to be in the same voice channel as the bot to add tracks.',
        flags: 64
      });
    }

    if (node.queue.history.size === 0) {
      return await interaction.reply({
        content: '❌ There are no previous tracks to add.',
        flags: 64
      });
    }

    const previousTrack = node.queue.history.previous;
    
    // Add the previous track to the current position
    node.queue.tracks.add(previousTrack, 0);
    
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
      .setTitle('➕ Added Previous Track')
      .setDescription(`Added **${previousTrack.title}** to the front of the queue`)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error in addprevious command');
    await interaction.reply({
      content: '❌ An error occurred while trying to add the previous track.',
      flags: 64
    });
  }
};
