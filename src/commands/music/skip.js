import { EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { loadState, saveState, saveQueue } from '../../music/queueStore.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'skip',
  description: 'Skip the current track',
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
        content: '❌ You need to be in the same voice channel as the bot to skip tracks.',
        flags: 64
      });
    }

    const currentTrack = node.currentTrack;
    const skipped = node.skip();

    if (skipped) {
      // Update queue in database
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
        .setTitle('⏭️ Track Skipped')
        .setDescription(`Skipped **${currentTrack.title}**`)
        .setColor(0x5865F2)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.reply({
        content: '❌ Could not skip the current track.',
        flags: 64
      });
    }

  } catch (error) {
    logger.error({ err: error }, 'Error in skip command');
    await interaction.reply({
      content: '❌ An error occurred while trying to skip the track.',
      flags: 64
    });
  }
};
