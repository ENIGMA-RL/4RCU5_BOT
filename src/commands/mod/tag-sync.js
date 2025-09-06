import { EmbedBuilder } from 'discord.js';
import { rolesConfig, isDev } from '../../config/configLoader.js';
import { fetchRoleHolders } from '../../utils/discordHelpers.js';
import logger from '../../utils/logger.js';

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

    // Early guard for dev: allow override via env
    const allowDevWrites = process.env.ALLOW_DEV_TAG_WRITES === 'true';
    if (isDev() && !allowDevWrites) {
      await interaction.editReply({ content: 'ℹ️ Tag sync is disabled in development. Set ALLOW_DEV_TAG_WRITES=true to enable.', flags: 64 });
      return;
    }
    
    const syncType = interaction.options.getString('type') || 'full';

    // Config: source guild (tag holders), destination guild (CNS)
    const roles = rolesConfig();
    const SRC_GUILD_ID = roles.tagSourceGuildId ?? roles.tagGuildId; // fallback to existing key
    const SRC_ROLE_ID  = roles.tagSourceRoleId ?? roles.cnsOfficialRole; // adjust per config
    const DST_GUILD_ID = process.env.GUILD_ID;
    const DST_ROLE_ID  = roles.cnsOfficialRole;

    const srcGuild = await interaction.client.guilds.fetch(SRC_GUILD_ID);
    const dstGuild = await interaction.client.guilds.fetch(DST_GUILD_ID);

    const srcHolders = await fetchRoleHolders(srcGuild, SRC_ROLE_ID);
    const dstMembers = await dstGuild.members.fetch();
    const srcIds = new Set([...srcHolders.keys()]);

    let added = 0, removed = 0;

    // Add
    for (const [, member] of dstMembers) {
      const shouldHave = srcIds.has(member.id);
      const hasDst = member.roles.cache.has(DST_ROLE_ID);
      if (shouldHave && !hasDst) {
        try { await member.roles.add(DST_ROLE_ID, 'mirror tag from source guild'); added++; } catch (e) { logger.warn({ err: e }, 'add role failed'); }
      }
    }

    // Remove (optional)
    for (const [, member] of dstMembers) {
      const shouldHave = srcIds.has(member.id);
      const hasDst = member.roles.cache.has(DST_ROLE_ID);
      if (hasDst && !shouldHave) {
        try { await member.roles.remove(DST_ROLE_ID, 'mirror tag removed in source guild'); removed++; } catch (e) { logger.warn({ err: e }, 'remove role failed'); }
      }
    }

    const result = { count: srcIds.size, updated: added, removed };

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
    logger.error({ err: error }, 'Error in tag-sync command');
    await interaction.editReply({
      content: '❌ An error occurred while executing the tag sync command.',
      flags: 64
    });
  }
}; 