import { rolesConfig, channelsConfig } from '../../config/configLoader.js';
import { updateStats } from '../../features/stats/statsUpdater.js';

export const data = {
  name: 'refreshstats',
  description: 'Manually refresh the server statistics embed (Admin only)',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  const memberRoles = interaction.member.roles.cache;
  const isAdmin = rolesConfig().adminRoles.some(roleId => memberRoles.has(roleId));

  if (!isAdmin) {
    return interaction.reply({
      content: '🚫 You need admin permissions to use this command.',
      flags: 64,
    });
  }

  try {
    await interaction.reply({
      content: '🔄 Refreshing server statistics...',
      flags: 64,
    });

    // Get the guild and stats channel
    const guild = interaction.guild;
    const statsChannelId = channelsConfig().statsChannelId;

    if (!statsChannelId) {
      await interaction.editReply({
        content: '❌ Stats channel ID not configured.',
        flags: 64,
      });
      return;
    }

    // Update the stats
    await updateStats(interaction.client, guild.id, statsChannelId);

    await interaction.editReply({
      content: '✅ Server statistics refreshed successfully!',
      flags: 64,
    });

    // Log when stats are refreshed manually
    // (Keep this log if you want to track manual refreshes, otherwise remove)
    // console.log(`Stats refreshed manually by ${interaction.user.tag}`);

  } catch (error) {
    console.error('Error refreshing server statistics:', error);
    await interaction.editReply({
      content: '❌ Failed to refresh server statistics. Please check the console for errors.',
      flags: 64,
    });
  }
}; 