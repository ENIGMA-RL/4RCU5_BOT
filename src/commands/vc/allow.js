import { ApplicationCommandOptionType } from 'discord.js';
import { isChannelOwner } from '../../features/voiceChannels/voiceChannelSystem.js';

export const data = {
  name: 'vc-allow',
  description: 'Allow a user to join your locked voice channel',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.User,
      description: 'The user to allow',
      required: true,
    },
  ],
};

export const execute = async (interaction) => {
  const channel = interaction.member.voice.channel;
  const user = interaction.options.getUser('user');
  if (!channel) {
    await interaction.reply({ content: 'You need to be in a voice channel to use this command.', flags: 64 });
    return;
  }
  const fresh = await channel.fetch();
  if (!(await isChannelOwner(fresh, interaction.member))) {
    await interaction.reply({ content: '❌ Only the channel owner can use this command.', flags: 64 });
    return;
  }
  await fresh.permissionOverwrites.edit(user.id, { Connect: true });
  await interaction.reply({ content: `✅ ${user.username} is now allowed to join your channel.`, flags: 64 });
}; 