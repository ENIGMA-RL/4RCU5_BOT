import { rolesConfig, levelSettingsConfig } from '../../config/configLoader.js';
import { getUserLevelData } from './levelingSystem.js';
import { logRoleChange } from '../../utils/botLogger.js';

// Automated level role sync function
export async function syncLevelRoles(guild) {
  try {
    console.log('🔄 Starting automated level role sync...');
    
    const roleAssignments = levelSettingsConfig().leveling.roleAssignments;
    const persistentRolesConfig = levelSettingsConfig().leveling.persistentRoles || {};
    const levelRoleIds = Object.values(roleAssignments);
    
    // Convert persistentRoles object to array of role IDs that should be persistent
    const persistentRoleIds = Object.entries(persistentRolesConfig)
      .filter(([level, isPersistent]) => isPersistent)
      .map(([level]) => roleAssignments[level])
      .filter(Boolean);

    let added = 0;
    let removed = 0;
    let checked = 0;

    // Fetch all members if not already cached
    if (guild.members.cache.size < guild.memberCount) {
      console.log('🔄 Fetching guild members for level role sync...');
      await guild.members.fetch();
    }

    for (const member of guild.members.cache.values()) {
      // Skip bots
      if (member.user.bot) continue;
      checked++;
      
      // Get user level
      const userData = await getUserLevelData(member.id);
      const userTotalLevel = userData?.totalLevel || 0;
      const userXP = (userData?.xp || 0) + (userData?.voice_xp || 0);
      
      // DEBUG: Log user data for debugging
      if (member.user.username === 'Rin' || member.user.username === 'erf_1.11') {
        console.log(`[DEBUG] ${member.user.username}: XP=${userXP}, Level=${userTotalLevel}, Roles=${member.roles.cache.map(r => r.name).join(', ')}`);
      }
      
      // Find the highest role for their total level
      let correctRoleId = null;
      let correctLevel = null;
      for (const [level, roleId] of Object.entries(roleAssignments)) {
        if (userTotalLevel >= parseInt(level)) {
          correctRoleId = roleId;
          correctLevel = level;
        }
      }
      
      // DEBUG: Log role assignment for debugging
      if (member.user.username === 'Rin' || member.user.username === 'erf_1.11') {
        console.log(`[DEBUG] ${member.user.username}: Should have role level ${correctLevel} (roleId: ${correctRoleId})`);
      }
      
      // Remove all level roles except persistent roles and the correct one
      for (const roleId of levelRoleIds) {
        if (member.roles.cache.has(roleId) && roleId !== correctRoleId) {
          // Check if this role should be persistent
          const roleLevel = Object.entries(roleAssignments).find(([level, id]) => id === roleId)?.[0];
          const isPersistent = roleLevel ? persistentRolesConfig[roleLevel] : false;
          if (!isPersistent) {
            await member.roles.remove(roleId, 'Automated level role sync');
            removed++;
            const role = guild.roles.cache.get(roleId);
            if (role) {
              await logRoleChange(guild.client, member.id, member.user.tag, 'Removed', role.name, 'Automated level role sync');
            }
            console.log(`[AUTO-SYNC] Removed roleId=${roleId} from ${member.user.tag}`);
            
            // DEBUG: Log removal for specific user
            if (member.user.username === 'Rin' || member.user.username === 'erf_1.11') {
              console.log(`[DEBUG] REMOVED role ${role?.name} from ${member.user.username}`);
            }
          } else {
            // DEBUG: Log persistent role
            if (member.user.username === 'Rin' || member.user.username === 'erf_1.11') {
              const role = guild.roles.cache.get(roleId);
              console.log(`[DEBUG] KEPT persistent role ${role?.name} for ${member.user.username}`);
            }
          }
        }
      }
      
      // Add the correct role if missing
      if (correctRoleId && !member.roles.cache.has(correctRoleId)) {
        await member.roles.add(correctRoleId, 'Automated level role sync');
        added++;
        const role = guild.roles.cache.get(correctRoleId);
        if (role) {
          await logRoleChange(guild.client, member.id, member.user.tag, 'Assigned', role.name, 'Automated level role sync');
        }
        console.log(`[AUTO-SYNC] Added roleId=${correctRoleId} to ${member.user.tag}`);
        
        // DEBUG: Log addition for specific user
        if (member.user.username === 'Rin' || member.user.username === 'erf_1.11') {
          console.log(`[DEBUG] ADDED role ${role?.name} to ${member.user.username}`);
        }
      } else if (correctRoleId && member.roles.cache.has(correctRoleId)) {
        // DEBUG: Log already has correct role
        if (member.user.username === 'Rin' || member.user.username === 'erf_1.11') {
          const role = guild.roles.cache.get(correctRoleId);
          console.log(`[DEBUG] ALREADY HAS correct role ${role?.name} for ${member.user.username}`);
        }
      }
    }

    console.log(`✅ Automated level role sync completed. Members checked: ${checked}, Roles added: ${added}, Roles removed: ${removed}`);
    return { checked, added, removed };
  } catch (error) {
    console.error('❌ Error during automated level role sync:', error);
    throw error;
  }
}

// Schedule periodic level role sync
export function scheduleLevelRoleSync(client, guildId) {
  console.log('🔄 Starting periodic level role sync interval (every 5 minutes)');
  
  setInterval(async () => {
    try {
      let guild = client.guilds.cache.get(guildId);
      if (!guild) {
        // Try to fetch the guild if it's not in cache
        try {
          guild = await client.guilds.fetch(guildId);
          console.log(`✅ Fetched guild ${guild.name} (${guild.id}) for level role sync`);
        } catch (fetchError) {
          console.error(`❌ Could not fetch guild ${guildId} for periodic level role sync:`, fetchError.message);
          return;
        }
      }
      
      const result = await syncLevelRoles(guild);
      if (result) {
        console.log(`✅ Periodic level role sync completed. Members checked: ${result.checked}, Roles added: ${result.added}, Roles removed: ${result.removed}`);
      } else {
        console.error('❌ Periodic level role sync failed: No result returned');
      }
    } catch (error) {
      console.error('Error during periodic level role sync:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
} 