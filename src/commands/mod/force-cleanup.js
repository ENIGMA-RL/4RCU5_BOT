import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';
import { isAdmin } from '../../utils/permissions.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'force-cleanup',
  description: 'Admin-only: Force immediate cleanup of all suspicious and deleted users',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  // Admin-only check
  const hasPermission = isAdmin(interaction.member);
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ Only administrators can use this command.',
      flags: 64
    });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    logger.info({ by: interaction.user.tag }, 'Force cleanup triggered');
    
    // Get all users from database
    const db = (await import('../../database/connection.js')).default;
    
    // Find and remove all suspicious users
    const suspiciousUsers = db.prepare(`
      SELECT user_id, username FROM users 
      WHERE username LIKE '%deleted_user%' 
         OR username LIKE '%unknown%' 
         OR username LIKE '%deleted%'
         OR (username LIKE '%user%' AND username REGEXP '^[0-9]+$')
    `).all();
    
    let removedCount = 0;
    
    for (const user of suspiciousUsers) {
      logger.info(`Force removing suspicious user: ${user.username} (${user.user_id})`);
      const deleteStmt = db.prepare('DELETE FROM users WHERE user_id = ?');
      deleteStmt.run(user.user_id);
      removedCount++;
    }
    
    // Also check for users that can't be fetched from Discord
    const allUsers = db.prepare('SELECT user_id FROM users').all();
    let fetchErrors = 0;
    
    for (const user of allUsers) {
      try {
        await interaction.client.users.fetch(user.user_id);
      } catch (error) {
        logger.warn(`Force removing user due to fetch error: ${user.user_id}`);
        const deleteStmt = db.prepare('DELETE FROM users WHERE user_id = ?');
        deleteStmt.run(user.user_id);
        fetchErrors++;
      }
    }
    
    const totalRemoved = removedCount + fetchErrors;
    
    const embed = new EmbedBuilder()
      .setTitle('🧹 Force Cleanup Complete')
      .setDescription('All suspicious and deleted users have been removed.')
      .setColor('#00ff00')
      .addFields(
        { name: '🚫 Suspicious Users Removed', value: removedCount.toString(), inline: true },
        { name: '❌ Fetch Error Users Removed', value: fetchErrors.toString(), inline: true },
        { name: '📊 Total Removed', value: totalRemoved.toString(), inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    
    logger.info(`Force cleanup completed: ${totalRemoved} users removed`);

  } catch (error) {
    logger.error({ err: error }, 'Error during force cleanup');
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Force Cleanup Failed')
      .setDescription('An error occurred during the force cleanup process.')
      .setColor('#ff0000')
      .addFields({
        name: 'Error Details',
        value: error.message || 'Unknown error occurred'
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
};
