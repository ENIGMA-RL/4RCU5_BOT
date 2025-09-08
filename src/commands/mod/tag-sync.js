import { EmbedBuilder } from 'discord.js';
import { rolesConfig, isDev } from '../../config/configLoader.js';
import { syncTagRolesFromGuild, syncAllUserTags } from '../../features/tagSync/tagSyncService.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'tag-sync',
  description: 'Manually sync CNS tag roles (CNS Developer only)',
  options: [
    {
      name: 'type',
      description: 'Type of sync to perform',
      type: 3, // STRING
      required: false,
      choices: [
        { name: 'Full Sync', value: 'full' },
        { name: 'Bulk Sync', value: 'bulk' }
      ]
    }
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

    const guild = interaction.guild;
    const syncType = interaction.options.getString('type') || 'full';

    let result;
    if (isDev()) {
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
      return;
    }

    if (syncType === 'bulk') {
      result = await syncAllUserTags(guild, interaction.client);
      const embed = new EmbedBuilder()
        .setTitle('🔄 CNS Tag Role Bulk Sync Results')
        .setColor('#00ff00')
        .setDescription('Bulk tag role synchronization completed!')
        .addFields(
          { name: '📊 Processed', value: String(result.processed || 0), inline: true },
          { name: '✅ Success', value: String(result.successCount || 0), inline: true },
          { name: '❌ Errors', value: String(result.errorCount || 0), inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Triggered by ${interaction.user.tag}` });
      
      await interaction.editReply({ embeds: [embed] });
    } else {
      result = await syncTagRolesFromGuild(guild, interaction.client);
      const embed = new EmbedBuilder()
        .setTitle('🔄 CNS Tag Role Sync Results')
        .setColor('#00ff00')
        .setDescription('Tag role synchronization with primary_guild completed!')
        .addFields(
          { name: '👥 Members with Tag', value: String(result.count || 0), inline: true },
          { name: '✅ Roles Added', value: String(result.updated || 0), inline: true },
          { name: '❌ Roles Removed', value: String(result.removed || 0), inline: true }
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