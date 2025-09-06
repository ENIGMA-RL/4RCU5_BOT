import { ApplicationCommandOptionType } from 'discord.js';
import { transferVoiceChannelOwnership, isChannelOwner } from '../../features/voiceChannels/voiceChannelSystem.js';
import { check as cdCheck, set as cdSet, formatRemaining as cdFormat } from '../../services/CooldownService.js';

export const data = {
  name: 'vc-transfer',
  description: 'Transfers ownership of your voice channel',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.User,
      description: 'The user to transfer ownership to',
      required: true,
    },
  ],
};

export const execute = async (interaction) => {
  const newOwner = interaction.options.getUser('user');
  const channel = interaction.member.voice.channel;
  if (!channel) {
    await interaction.reply({ content: 'You need to be in a voice channel to transfer ownership.', flags: 64 });
    return;
  }
  await channel.fetch();
  const res = cdCheck(interaction.member, 'vc-transfer');
  if (res.onCooldown) {
    const remaining = cdFormat(res.remainingTime);
    await interaction.reply({ content: `⏰ Try again in ${remaining}`, flags: 64 });
    return;
  }
  await channel.guild.members.fetch();
  await interaction.deferReply({ flags: 64 });
  const fresh = await channel.fetch();
  if (!(await isChannelOwner(fresh, interaction.member))) {
    await interaction.editReply({ content: '❌ Only the channel owner can use this command.' });
    return;
  }
  await transferVoiceChannelOwnership(fresh, newOwner);
  cdSet(interaction.member, 'vc-transfer');
  await interaction.editReply({ content: `Voice channel ownership transferred to ${newOwner.username}.` });
}; 