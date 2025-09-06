import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { cleanupDeletedUsers } from '../../repositories/usersAdminRepo.js';
import { rolesConfig } from '../../config/configLoader.js';
import { isAdmin } from '../../utils/permissions.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'cleanup-database',
  description: 'Admin-only: Manually trigger database cleanup to remove deleted users',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  // Admin-only check
  const hasPermission = isAdmin(interaction.member);
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ You do not have permission to use this command.',
      flags: 64
    });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    // keep it quiet in production logs
    
    const result = await cleanupDeletedUsers(interaction.client);
    
    const embed = new EmbedBuilder()
      .setTitle('🧹 Database Cleanup Complete')
      .setDescription('The database has been cleaned up successfully.')
      .setColor('#00ff00')
      .addFields(
        { name: '🗑️ Deleted Users Removed', value: result.deletedCount.toString(), inline: true },
        { name: '🚪 Users Marked as Left', value: result.leftServerCount.toString(), inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    logger.error({ err: error }, 'Error during manual cleanup');
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Cleanup Failed')
      .setDescription('An error occurred during the cleanup process.')
      .setColor('#ff0000')
      .addFields({
        name: 'Error Details',
        value: error.message || 'Unknown error occurred'
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
};
