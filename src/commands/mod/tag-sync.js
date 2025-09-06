import { EmbedBuilder } from 'discord.js';
import { rolesConfig, isDev } from '../../config/configLoader.js';
import { mirrorFromSourceRole, mirrorUserFromSourceRole } from '../../features/tagSync/tagSyncService.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'tag-sync',
  description: 'Sync CNS Official role with live server tag',
  options: [
    { name: 'user', description: 'Specific user to sync', type: 6, required: false }, // USER
    { name: 'all', description: 'Scan all members', type: 5, required: false } // BOOLEAN
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    // Check if user has CNS Developer role
    const memberRoles = interaction.member.roles.cache;
    const isCnsDev = memberRoles.has(rolesConfig().cnsDeveloperRole);
    if (!isCnsDev) {
      await interaction.reply({
        content: '❌ Only users with the CNS Developer role can use this command.',
        flags: 64
      });
      return;
    }

    await interaction.deferReply({ flags: 64 });

    // Early guard for dev: allow override via env
    const allowDevWrites = process.env.ALLOW_DEV_TAG_WRITES === 'true';
    if (isDev() && !allowDevWrites) {
      await interaction.editReply({ content: 'ℹ️ Tag sync is disabled in development. Set ALLOW_DEV_TAG_WRITES=true to enable.', flags: 64 });
      return;
    }
    
    const guild = interaction.guild;
    // mirror-style reconciliation

    const targetUser = interaction.options.getUser('user');
    const doAll = interaction.options.getBoolean('all') === true;
    const syncType = doAll ? 'bulk' : 'single';

    let processed = 0, added = 0, removed = 0;
    if (doAll) {
      const res = await mirrorFromSourceRole(interaction.client);
      processed = res.count;
      added = res.updated;
      removed = res.removed;
    } else {
      const id = (targetUser?.id) || interaction.user.id;
      const r = await mirrorUserFromSourceRole(interaction.client, id);
      processed = 1;
      added = r.added || 0;
      removed = r.removed || 0;
    }
    const result = { count: processed, updated: added, removed };

    if (isDev() && !allowDevWrites) {
      const embed = new EmbedBuilder()
        .setTitle('🔄 CNS Tag Role Sync Results')
        .setColor('#ffff00') // Yellow for development
        .setDescription('Tag role synchronization skipped in development mode!')
        .addFields(
          { name: 'ℹ️ Status', value: 'Tag sync is disabled in development mode', inline: true },
          { name: '📊 Processed', value: '0', inline: true },
          { name: '✅ Success', value: '0', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Triggered by ${interaction.user.tag} (Development Mode)` });
      
      await interaction.editReply({ embeds: [embed] });
    } else if (syncType === 'bulk') {
      const embed = new EmbedBuilder()
        .setTitle('🔄 CNS Tag Role Bulk Sync Results')
        .setColor('#00ff00')
        .setDescription('Bulk tag role synchronization completed!')
        .addFields(
          { name: 'processed', value: String(result.count), inline: true },
          { name: 'roles added', value: String(result.updated), inline: true },
          { name: 'roles removed', value: String(result.removed), inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Triggered by ${interaction.user.tag}` });
      
      await interaction.editReply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setTitle('🔄 CNS Tag Role Sync Results')
        .setColor('#00ff00')
        .setDescription('Tag role synchronization completed!')
        .addFields(
          { name: 'processed', value: String(result.count), inline: true },
          { name: 'roles added', value: String(result.updated), inline: true },
          { name: 'roles removed', value: String(result.removed), inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Triggered by ${interaction.user.tag}` });

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in tag-sync command');
    await interaction.editReply({
      content: '❌ An error occurred while executing the tag sync command.',
      flags: 64
    });
  }
}; 