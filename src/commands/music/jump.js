import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { saveQueue } from '../../music/queueStore.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'jump',
  description: 'Jump to a specific track in the queue',
  options: [
    {
      name: 'index',
      type: ApplicationCommandOptionType.Integer,
      description: 'Track number to jump to (1-based)',
      required: true,
      min_value: 1
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    const index = interaction.options.getInteger('index') - 1; // Convert to 0-based
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

    if (index < 0 || index >= node.queue.tracks.size) {
      return await interaction.reply({
        content: `❌ Invalid track index. Please use a number between 1 and ${node.queue.tracks.size}.`,
        flags: 64
      });
    }

    // Jump to the specified track
    const track = node.queue.tracks.at(index);
    if (!track) {
      return await interaction.reply({
        content: '❌ Could not find the specified track.',
        flags: 64
      });
    }

    // Remove tracks before the target index
    for (let i = 0; i < index; i++) {
      node.queue.tracks.removeAt(0);
    }

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
      .setTitle('⏭️ Jumped to Track')
      .setDescription(`Jumped to **${track.title}** (position ${index + 1})`)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error in jump command');
    await interaction.reply({
      content: '❌ An error occurred while trying to jump to the track.',
      flags: 64
    });
  }
};
