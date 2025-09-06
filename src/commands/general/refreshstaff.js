import { refreshStaffEmbed } from '../../features/staff/staffEmbed.js';
import { rolesConfig, channelsConfig } from '../../config/configLoader.js';
import { isAdmin } from '../../utils/permissions.js';
import logger from '../../utils/logger.js';



export const data = {
  name: 'refreshstaff',
  description: 'Manually refresh the staff embed (Admin only)',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  const canAdmin = isAdmin(interaction.member);

  if (!canAdmin) {
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
    const channelId = channelsConfig().staffChannelId;

    await refreshStaffEmbed(interaction.client, guildId, channelId);

    await interaction.editReply({
      content: '✅ Staff embed refreshed successfully!',
      flags: 64,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error refreshing staff embed');
    await interaction.editReply({
      content: '❌ Failed to refresh staff embed. Please check the console for errors.',
      flags: 64,
    });
  }
};
