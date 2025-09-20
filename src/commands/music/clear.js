import { EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { clearQueue, clearResumeState } from '../../music/queueStore.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'clear',
  description: 'Clear the music queue (alias for stop)',
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
        content: '❌ You need to be in the same voice channel as the bot to clear the queue.',
        flags: 64
      });
    }

    // Clear queue and stop if playing
    clearQueue(guild.id);
    clearResumeState(guild.id);
    
    if (node.isPlaying()) {
      node.stop();
    }

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Queue Cleared')
      .setDescription('Cleared the music queue.')
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error in clear command');
    await interaction.reply({
      content: '❌ An error occurred while trying to clear the queue.',
      flags: 64
    });
  }
};
