import { EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { clearQueue, clearResumeState } from '../../music/queueStore.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'disconnect',
  description: 'Disconnect from the voice channel and clear the queue',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    const guild = interaction.guild;
    const member = interaction.member;

    const player = useMainPlayer();
    const node = player.nodes.get(guild.id);

    if (!node || !node.connection) {
      return await interaction.reply({
        content: '❌ I\'m not connected to any voice channel.',
        flags: 64
      });
    }

    // Check if user is in the same voice channel
    if (member.voice.channelId !== node.connection?.joinConfig?.channelId) {
      return await interaction.reply({
        content: '❌ You need to be in the same voice channel as the bot to disconnect it.',
        flags: 64
      });
    }

    // Stop playing and disconnect
    if (node.isPlaying()) {
      node.stop();
    }
    
    node.disconnect();
    clearQueue(guild.id);
    clearResumeState(guild.id);

    const embed = new EmbedBuilder()
      .setTitle('👋 Disconnected')
      .setDescription('Disconnected from the voice channel and cleared the queue.')
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error in disconnect command');
    await interaction.reply({
      content: '❌ An error occurred while trying to disconnect.',
      flags: 64
    });
  }
};
