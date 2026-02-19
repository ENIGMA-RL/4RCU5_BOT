import { refreshStaffEmbed } from '../features/staff/staffEmbed.js';
import { staffConfig } from '../config/configLoader.js';
import { giveawayConfig } from '../config/configLoader.js';
import { recordRoleFirstSeen } from '../repositories/tagRepo.js';
import logger from '../utils/logger.js';
import { syncUserTagRole } from '../features/tagSync/tagSyncService.js';
import { syncRoleCategoriesForMember } from '../utils/roleCategorySync.js';

export const name = 'guildMemberUpdate';
export const once = false;

export async function execute(oldMember, newMember) {
  logger.info(`🔧 [DEBUG] guildMemberUpdate event for user ${newMember.user.tag} (${newMember.id})`);
  
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
    // Schedule a tag sync after a short delay to allow Discord to propagate presence/user updates
    logger.info(`🔧 [DEBUG] Scheduling tag sync for user ${newMember.user.tag} in 3 seconds...`);
    setTimeout(async () => {
      try {
        logger.info(`🔧 [DEBUG] Executing tag sync for user ${newMember.user.tag}...`);
        const result = await syncUserTagRole(newMember.id, newMember.guild, newMember.client);
        logger.info({ result }, `🔧 [DEBUG] Tag sync result for ${newMember.user.tag}`);
        if (result && result.success && result.action !== 'no_change') {
          logger.info(`✅ Tag role sync completed for ${newMember.user.tag}: ${result.action}`);
        }
      } catch (err) {
        logger.error({ err }, `❌ Error syncing tag role for user ${newMember.user.tag}`);
      }
    }, 3000);

    // Check if any staff roles were added or removed
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const rolesChanged =
      oldRoles.size !== newRoles.size ||
      Array.from(oldRoles.keys()).some((id) => !newRoles.has(id));
    
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

    if (rolesChanged) {
      setTimeout(async () => {
        try {
          await syncRoleCategoriesForMember(newMember, 'Role category sync');
        } catch (err) {
          logger.error({ err }, 'Error running role category sync');
        }
      }, 500);
    }
    
  } catch (error) {
    logger.error({ err: error }, 'Error in guildMemberUpdate event');
  }
}; 