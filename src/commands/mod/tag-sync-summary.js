import { EmbedBuilder } from 'discord.js';
import { rolesConfig, isDev } from '../../config/configLoader.js';
import { syncTagRolesFromGuild, syncAllUserTags, isGloballyRateLimited, getGlobalRateLimitReset } from '../../features/tagSync/tagSyncService.js';

export const data = {
  name: 'tag-sync-summary',
  description: 'Run CNS tag sync and get a private summary (CNS Developer only)',
  options: [
    {
      name: 'type',
      description: 'Type of sync to perform',
      type: 3,
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
    const memberRoles = interaction.member.roles.cache;
    const isCnsDev = memberRoles.has(rolesConfig().cnsDeveloperRole);
    if (!isCnsDev) {
      await interaction.reply({ content: '❌ Only CNS Developers can run this.', flags: 64 });
      return;
    }

    const syncType = interaction.options.getString('type') || 'full';
    const startedAt = Date.now();

    if (isGloballyRateLimited()) {
      const resetAt = getGlobalRateLimitReset();
      const seconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
      const embed = new EmbedBuilder()
        .setTitle('⏳ Rate Limited')
        .setColor('#ffa500')
        .setDescription('Discord API rate limit in effect. Please try again later.')
        .addFields(
          { name: 'Retry After', value: `${seconds}s`, inline: true }
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    await interaction.deferReply({ flags: 64 });

    let result;
    if (syncType === 'bulk') {
      result = await syncAllUserTags(interaction.guild, interaction.client);
    } else {
      result = await syncTagRolesFromGuild(interaction.guild, interaction.client);
    }

    const elapsedMs = Date.now() - startedAt;

    if (isDev()) {
      const embed = new EmbedBuilder()
        .setTitle('🔄 CNS Tag Sync (Development)')
        .setColor('#ffff00')
        .setDescription('Tag sync is disabled in development mode')
        .addFields(
          { name: 'Processed', value: '0', inline: true },
          { name: 'Duration', value: `${elapsedMs}ms`, inline: true }
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (!result) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Tag Sync Failed')
        .setColor('#ff4d4d')
        .setDescription('No result returned from sync function')
        .addFields({ name: 'Duration', value: `${elapsedMs}ms`, inline: true })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (syncType === 'bulk') {
      const success = result.success !== false;
      const color = success ? '#00cc66' : '#ff4d4d';
      const embed = new EmbedBuilder()
        .setTitle('🔄 CNS Tag Role Bulk Sync Summary')
        .setColor(color)
        .addFields(
          { name: 'Processed', value: `${result.processed || 0}`, inline: true },
          { name: 'Success', value: `${result.successCount || 0}`, inline: true },
          { name: 'Errors', value: `${result.errorCount || 0}`, inline: true },
          { name: 'Duration', value: `${elapsedMs}ms`, inline: true }
        )
        .setTimestamp();

      if (result.error === 'rate_limited') {
        const resetAt = getGlobalRateLimitReset();
        const seconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
        embed.addFields({ name: 'Rate Limit', value: `Backoff active. Retry in ~${seconds}s`, inline: false });
      }

      await interaction.editReply({ embeds: [embed] });
    } else {
      const color = '#00cc66';
      const embed = new EmbedBuilder()
        .setTitle('🔄 CNS Tag Role Sync Summary')
        .setColor(color)
        .addFields(
          { name: 'Members with Tag', value: `${result.count}`, inline: true },
          { name: 'Roles Added', value: `${result.updated}`, inline: true },
          { name: 'Roles Removed', value: `${result.removed}`, inline: true },
          { name: 'Duration', value: `${elapsedMs}ms`, inline: true }
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    try {
      await interaction.editReply({ content: '❌ An error occurred while running tag sync.', flags: 64 });
    } catch {}
    console.error('Error in tag-sync-summary command:', error);
  }
};


