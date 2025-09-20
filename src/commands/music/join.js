import { EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import logger from '../../utils/logger.js';

export const data = {
  name: 'join',
  description: 'Join your voice channel',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    const member = interaction.member;
    const guild = interaction.guild;

    if (!member.voice.channel) {
      return await interaction.reply({
        content: '❌ You need to be in a voice channel to use this command!',
        flags: 64
      });
    }

    const player = useMainPlayer();
    let node = player.nodes.get(guild.id);

    if (!node) {
      node = player.nodes.create(guild.id, {
        metadata: {
          channel: interaction.channel,
          client: guild.members.me,
          requestedBy: interaction.user
        },
        selfDeaf: false,
        volume: 80,
        leaveOnEnd: false,
        leaveOnStop: false,
        leaveOnEmpty: false
      });
    }

    if (node.connection) {
      return await interaction.reply({
        content: '❌ I\'m already connected to a voice channel!',
        flags: 64
      });
    }

    await node.connect(member.voice.channel);

    const embed = new EmbedBuilder()
      .setTitle('🎵 Joined Voice Channel')
      .setDescription(`Joined **${member.voice.channel.name}**`)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error in join command');
    await interaction.reply({
      content: '❌ An error occurred while trying to join the voice channel.',
      flags: 64
    });
  }
};
