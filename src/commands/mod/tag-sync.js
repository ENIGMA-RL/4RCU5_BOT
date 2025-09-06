import { EmbedBuilder } from 'discord.js';
import { rolesConfig, isDev } from '../../config/configLoader.js';
import { fetchUserPrimaryGuild } from '../../lib/discordProfileApi.js';
import { setCnsTagEquippedWithGuild as recordEquipped, setCnsTagUnequippedWithGuild as recordUnequipped } from '../../repositories/tagRepo.js';
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

    const targetUser = interaction.options.getUser('user');
    const doAll = interaction.options.getBoolean('all') === true;
    const syncType = doAll ? 'bulk' : 'single';

    let processed = 0, added = 0, removed = 0;
    if (doAll) {
      const members = await guild.members.fetch();
      for (const [id] of members) {
        try {
          const r = await reconcile(id);
          processed++;
          if (r.added) added += r.added;
          if (r.removed) removed += r.removed;
          await new Promise(res => setTimeout(res, 200));
        } catch {}
      }
    } else {
      const id = (targetUser?.id) || interaction.user.id;
      const r = await reconcile(id);
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