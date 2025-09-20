import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { loadState, saveState } from '../../music/queueStore.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'loop',
  description: 'Set the loop mode for the music player',
  options: [
    {
      name: 'mode',
      type: ApplicationCommandOptionType.String,
      description: 'Loop mode to set',
      required: true,
      choices: [
        { name: 'Off', value: 'off' },
        { name: 'Track', value: 'track' },
        { name: 'Queue', value: 'queue' }
      ]
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    const mode = interaction.options.getString('mode');
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
        content: '❌ You need to be in the same voice channel as the bot to change loop mode.',
        flags: 64
      });
    }

    // Set loop mode
    let repeatMode;
    switch (mode) {
      case 'off':
        repeatMode = 0;
        break;
      case 'track':
        repeatMode = 1;
        break;
      case 'queue':
        repeatMode = 2;
        break;
      default:
        return await interaction.reply({
          content: '❌ Invalid loop mode.',
          flags: 64
        });
    }

    node.setRepeatMode(repeatMode);

    // Update database state
    const state = loadState(guild.id);
    state.loop_mode = mode;
    saveState(guild.id, state);

    const modeText = {
      'off': 'Off',
      'track': 'Track',
      'queue': 'Queue'
    };

    const embed = new EmbedBuilder()
      .setTitle('🔁 Loop Mode Changed')
      .setDescription(`Loop mode set to **${modeText[mode]}**`)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error in loop command');
    await interaction.reply({
      content: '❌ An error occurred while trying to change the loop mode.',
      flags: 64
    });
  }
};
