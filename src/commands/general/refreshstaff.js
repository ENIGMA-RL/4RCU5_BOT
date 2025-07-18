import { refreshStaffEmbed } from '../../features/staff/staffEmbed.js';
import rolesConfig from '../../config/roles.json' with { type: 'json' };
import channelsConfig from '../../config/channels.json' with { type: 'json' };



export const data = {
  name: 'refreshstaff',
  description: 'Manually refresh the staff embed (Admin only)',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  const memberRoles = interaction.member.roles.cache;
  const isAdmin = rolesConfig.adminRoles.some(roleId => memberRoles.has(roleId));

  if (!isAdmin) {
    return interaction.reply({
      content: '🚫 You need admin permissions to use this command.',
      flags: 64,
    });
  }

  try {
    await interaction.reply({
      content: '🔄 Refreshing staff embed...',
      flags: 64,
    });

    const guildId = interaction.guild.id;
    const channelId = channelsConfig.staffChannelId;

    await refreshStaffEmbed(interaction.client, guildId, channelId);

    await interaction.editReply({
      content: '✅ Staff embed refreshed successfully!',
      flags: 64,
    });
  } catch (error) {
    console.error('Error refreshing staff embed:', error);
    await interaction.editReply({
      content: '❌ Failed to refresh staff embed. Please check the console for errors.',
      flags: 64,
    });
  }
};
