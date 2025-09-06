import { syncUserTagRole } from '../features/tagSync/tagSyncService.js';
import { refreshStaffEmbed } from '../features/staff/staffEmbed.js';
import { staffConfig } from '../config/configLoader.js';
import { giveawayConfig } from '../config/configLoader.js';
import { recordRoleFirstSeen } from '../repositories/tagRepo.js';
import { rolesConfig } from '../config/configLoader.js';
import { setCnsTagEquippedWithGuild, setCnsTagUnequippedWithGuild } from '../repositories/tagRepo.js';
import { logTagSync } from '../utils/botLogger.js';
import logger from '../utils/logger.js';
import { mirrorSingleUser } from '../services/tagService.js';
import { fetchUserPrimaryGuild } from '../lib/discordProfileApi.js';

const TAG_GUILD_ID = process.env.TAG_GUILD_ID;
const TAG_GUILD_ROLE_ID = process.env.TAG_GUILD_ROLE_ID;

export const name = 'guildMemberUpdate';
export const once = false;

export async function execute(oldMember, newMember) {
  logger.trace(`guildMemberUpdate event for user ${newMember.user.tag} (${newMember.id})`);

  // Handle tag-guild mirroring here to guarantee this handler runs
  try {
    if (TAG_GUILD_ID && TAG_GUILD_ROLE_ID && newMember.guild.id === TAG_GUILD_ID) {
      const had = oldMember?.roles?.cache?.has(TAG_GUILD_ROLE_ID) ?? false;
      const has = newMember.roles.cache.has(TAG_GUILD_ROLE_ID);
      logger.info({ userId: newMember.id, had, has }, '[TagEvent/MainHandler] guildMemberUpdate role delta');
      if (had !== has) {
        await mirrorSingleUser(newMember.client, newMember.id, has);
      }
      return; // do not run main-guild branch for tag-guild events
    }
  } catch (e) {
    logger.error({ err: e }, '[TagEvent/MainHandler] mirror failed');
  }

  // API-based check (primary_guild) for MAIN guild – instant, no mirror role needed
  try {
    const mainGuildId = (await import('../config/configLoader.js')).rolesConfig().mainGuildId || null;
    const officialRoleId = (await import('../config/configLoader.js')).rolesConfig().cnsOfficialRole || null;
    if (!mainGuildId || !officialRoleId) return;
    if (newMember.guild.id !== mainGuildId) return;

    logger.info({ userId: newMember.id }, '[TagAPI] checking primary_guild');
    const { identity_enabled, identity_guild_id } = await fetchUserPrimaryGuild(newMember.id, mainGuildId);
    const hasTag = Boolean(identity_enabled && identity_guild_id === mainGuildId);
    const hasRole = newMember.roles.cache.has(officialRoleId);
    logger.info({ userId: newMember.id, hasTag, hasRole, identity_enabled, identity_guild_id }, '[TagAPI] result');

    if (hasTag && !hasRole) {
      try {
        await newMember.roles.add(officialRoleId, 'Server tag enabled (API)');
        try { setCnsTagEquippedWithGuild(newMember.id, mainGuildId); } catch {}
        try { await logTagSync(newMember.client, newMember.id, newMember.user?.tag || newMember.id, 'Added', 'API sync'); } catch {}
      } catch (err) {
        logger.error({ err }, '[TagAPI] add role failed');
      }
    } else if (!hasTag && hasRole) {
      try {
        await newMember.roles.remove(officialRoleId, 'Server tag disabled (API)');
        try { setCnsTagUnequippedWithGuild(newMember.id, mainGuildId); } catch {}
        try { await logTagSync(newMember.client, newMember.id, newMember.user?.tag || newMember.id, 'Removed', 'API sync'); } catch {}
      } catch (err) {
        logger.error({ err }, '[TagAPI] remove role failed');
      }
    }
  } catch (e) {
    logger.error({ err: e }, '[TagAPI] check failed');
  }
  
  // Track role tenure for giveaway eligibility
  const cfg = giveawayConfig();
  const tagId = cfg.tag_eligibility?.cns_tag_role_id;
  if (tagId) {
    const had = oldMember.roles.cache.has(tagId);
    const has = newMember.roles.cache.has(tagId);
    if (!had && has) {
      recordRoleFirstSeen(newMember.guild.id, newMember.id, tagId);
    }
  }

  try {
    // (Remove all console.log statements for clean production output)
    if (oldMember.nickname !== newMember.nickname) {
    }
    
    // Immediate write-on-change for CNS Official role to ensure timestamps are recorded in production
    const cnsOfficialRoleId = rolesConfig().cnsOfficialRole;
    const hadCnsRole = oldMember.roles.cache.has(cnsOfficialRoleId);
    const hasCnsRole = newMember.roles.cache.has(cnsOfficialRoleId);
    if (!hadCnsRole && hasCnsRole) {
      try { setCnsTagEquippedWithGuild(newMember.id, newMember.guild.id); } catch {}
      try { await logTagSync(newMember.client, newMember.id, newMember.user.tag, 'Added', 'Role added via member update'); } catch {}
    } else if (hadCnsRole && !hasCnsRole) {
      try { setCnsTagUnequippedWithGuild(newMember.id, newMember.guild.id); } catch {}
      try { await logTagSync(newMember.client, newMember.id, newMember.user.tag, 'Removed', 'Role removed via member update'); } catch {}
    }

    // Keep single delayed retry to allow propagation
    setTimeout(async () => {
      try { await syncUserTagRole(newMember.id, newMember.guild, newMember.client, { forceRefresh: true, noCache: true }); } catch {}
    }, 1200);
    
    // Check if any staff roles were added or removed
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;
    
    const staffRoleIds = staffConfig().staffRoles.map(role => role.id);
    
    // Check if any staff roles changed
    const hasStaffRoleChange = staffRoleIds.some(roleId => 
      oldRoles.has(roleId) !== newRoles.has(roleId)
    );
    
    if (hasStaffRoleChange) {
      // Small delay to ensure Discord has processed the role change
      setTimeout(async () => {
        try {
          await refreshStaffEmbed(newMember.client);
          // intentionally quiet
        } catch (error) {
          logger.error({ err: error }, 'Error updating staff embed after role change');
        }
      }, 2000); // 2 second delay
    }
    
  } catch (error) {
    logger.error({ err: error }, 'Error in guildMemberUpdate event');
  }
}; 