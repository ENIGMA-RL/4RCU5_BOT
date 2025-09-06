import { EmbedBuilder } from 'discord.js';
import { rolesConfig, isDev } from '../../config/configLoader.js';
import { fetchUserPrimaryGuild } from '../../lib/discordProfileApi.js';
import { setCnsTagEquippedWithGuild as recordEquipped, setCnsTagUnequippedWithGuild as recordUnequipped } from '../../repositories/tagRepo.js';
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

    const guild = interaction.guild;
    const roleId = rolesConfig().cnsOfficialRole;
    const guildId = guild.id;

    // reconcile helper
    const reconcile = async (userId) => {
      const { identity_enabled, identity_guild_id } = await fetchUserPrimaryGuild(userId, guildId);
      const hasTag = Boolean(identity_enabled && identity_guild_id === guildId);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return { changed: false };
      if (hasTag && !member.roles.cache.has(roleId)) {
        await member.roles.add(roleId, 'manual tag sync');
        try { recordEquipped(member.id, guildId); } catch {}
        return { changed: true, added: 1 };
      } else if (!hasTag && member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, 'manual tag sync');
        try { recordUnequipped(member.id, guildId); } catch {}
        return { changed: true, removed: 1 };
      }
      return { changed: false };
    };

    let processed = 0, added = 0, removed = 0;
    if (syncType === 'bulk') {
      const members = await guild.members.fetch();
      for (const [id] of members) {
        try {
          const r = await reconcile(id);
          processed++;
          if (r.added) added += r.added;
          if (r.removed) removed += r.removed;
          await new Promise(res => setTimeout(res, 250));
        } catch {}
      }
    } else {
      const r = await reconcile(interaction.user.id);
      processed = 1;
      if (r.added) added += r.added;
      if (r.removed) removed += r.removed;
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