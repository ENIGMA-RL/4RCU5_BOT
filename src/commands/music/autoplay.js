import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { loadState, saveState } from '../../music/queueStore.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'autoplay',
  description: 'Toggle autoplay for music recommendations',
  options: [
    {
      name: 'toggle',
      type: ApplicationCommandOptionType.String,
      description: 'Enable or disable autoplay',
      required: true,
      choices: [
        { name: 'On', value: 'on' },
        { name: 'Off', value: 'off' }
      ]
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    const toggle = interaction.options.getString('toggle');
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
        content: '❌ You need to be in the same voice channel as the bot to change autoplay settings.',
        flags: 64
      });
    }

    const autoplayEnabled = toggle === 'on';

    // Update database state
    const state = loadState(guild.id);
    state.autoplay = autoplayEnabled ? 1 : 0;
    saveState(guild.id, state);

    const embed = new EmbedBuilder()
      .setTitle('🎲 Autoplay Toggled')
      .setDescription(`Autoplay is now **${autoplayEnabled ? 'enabled' : 'disabled'}**`)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error in autoplay command');
    await interaction.reply({
      content: '❌ An error occurred while trying to toggle autoplay.',
      flags: 64
    });
  }
};
