import { syncUserTagRole } from '../features/tagSync/tagSyncService.js';
import { refreshStaffEmbed } from '../features/staff/staffEmbed.js';
import { staffConfig } from '../config/configLoader.js';
import { giveawayConfig } from '../config/configLoader.js';
import { recordRoleFirstSeen } from '../database/db.js';

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
    
    console.log(`🔧 [DEBUG] Scheduling tag sync for user ${newMember.user.tag} in 3 seconds...`);
    setTimeout(async () => {
      try {
        console.log(`🔧 [DEBUG] Executing tag sync for user ${newMember.user.tag}...`);
        const result = await syncUserTagRole(newMember.id, newMember.guild, newMember.client);
        console.log(`🔧 [DEBUG] Tag sync result for ${newMember.user.tag}:`, result);
        // Optionally log only if something changed
        if (result && result.success && result.action !== 'no_change') {
          console.log(`✅ Tag role sync completed for ${newMember.user.tag}: ${result.action}`);
        }
      } catch (err) {
        console.error(`❌ Error syncing tag role for user ${newMember.user.tag}:`, err);
      }
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