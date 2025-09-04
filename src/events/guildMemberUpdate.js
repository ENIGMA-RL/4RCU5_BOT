import { syncUserTagRole } from '../features/tagSync/tagSyncService.js';
import { refreshStaffEmbed } from '../features/staff/staffEmbed.js';
import { staffConfig } from '../config/configLoader.js';
import { giveawayConfig } from '../config/configLoader.js';
import { recordRoleFirstSeen } from '../database/db.js';
import { rolesConfig } from '../config/configLoader.js';
import { setCnsTagEquippedWithGuild, setCnsTagUnequippedWithGuild } from '../database/db.js';
import { logTagSync } from '../utils/botLogger.js';

export const name = 'guildMemberUpdate';
export const once = false;

export async function execute(oldMember, newMember) {
  console.log(`🔧 [DEBUG] guildMemberUpdate event for user ${newMember.user.tag} (${newMember.id})`);
  
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

    // Keep async tag status verification, but lower priority
    setTimeout(async () => {
      try {
        await syncUserTagRole(newMember.id, newMember.guild, newMember.client);
      } catch {}
    }, 3000);
    
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
          // console.log(`✅ Staff embed updated after role change for ${newMember.user.tag}`);
        } catch (error) {
          console.error('Error updating staff embed after role change:', error);
        }
      }, 2000); // 2 second delay
    }
    
  } catch (error) {
    console.error('Error in guildMemberUpdate event:', error);
  }
}; 