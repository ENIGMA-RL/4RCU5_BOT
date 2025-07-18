import { EmbedBuilder } from 'discord.js';
import { syncTagRolesFromGuild, syncAllUserTags } from '../../features/tagSync/tagSyncService.js';
import { rolesConfig, isDev } from '../../config/configLoader.js';

export const data = {
  name: 'tag-sync',
  description: 'Manually sync CNS tag roles based on tag guild membership (CNS Developer only)',
  options: [
    {
      name: 'type',
      description: 'Type of sync to perform',
      type: 3, // STRING
      required: false,
      choices: [
        {
          name: 'Full Sync',
          value: 'full'
        },
        {
          name: 'Bulk Sync',
          value: 'bulk'
        }
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
    
    const syncType = interaction.options.getString('type') || 'full';
    
    let result;
    if (syncType === 'bulk') {
      result = await syncAllUserTags(interaction.guild, interaction.client);
    } else {
      result = await syncTagRolesFromGuild(interaction.guild, interaction.client);
    }

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
    } else if (syncType === 'bulk') {
      const embed = new EmbedBuilder()
        .setTitle('🔄 CNS Tag Role Bulk Sync Results')
        .setColor('#00ff00')
        .setDescription('Bulk tag role synchronization completed!')
        .addFields(
          { name: '📊 Processed', value: `${result.processed || 0}`, inline: true },
          { name: '✅ Success', value: `${result.successCount || 0}`, inline: true },
          { name: '❌ Errors', value: `${result.errorCount || 0}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Triggered by ${interaction.user.tag}` });
      
      await interaction.editReply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setTitle('🔄 CNS Tag Role Sync Results')
        .setColor('#00ff00')
        .setDescription('Tag role synchronization with tag guild completed!')
        .addFields(
          { name: '👥 Members with Tag', value: `${result.count}`, inline: true },
          { name: '✅ Roles Added', value: `${result.updated}`, inline: true },
          { name: '❌ Roles Removed', value: `${result.removed}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Triggered by ${interaction.user.tag}` });

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Error in tag-sync command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while executing the tag sync command.',
      flags: 64
    });
  }
}; 