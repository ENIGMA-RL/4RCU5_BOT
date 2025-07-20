import { rolesConfig, levelSettingsConfig } from '../../config/configLoader.js';
import { getUserLevelData } from '../../features/leveling/levelingSystem.js';
import { logRoleChange } from '../../utils/botLogger.js';

export const data = {
  name: 'sync-level-roles',
  description: 'Sync level roles for all members (CNS Developer only)',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  // Restrict to CNS Developer role only
  const devRoleId = rolesConfig().cnsDeveloperRole;
  if (!interaction.member.roles.cache.has(devRoleId)) {
    await interaction.reply({
      content: '❌ Only users with the CNS Developer role can use this command.',
      flags: 64
    });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  const guild = interaction.guild;
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

  // Fetch all members
  await guild.members.fetch();
  for (const member of guild.members.cache.values()) {
    // Skip bots
    if (member.user.bot) continue;
    checked++;
    // Get user level
    const userData = await getUserLevelData(member.id);
    const userTotalLevel = userData?.totalLevel || 0;
    
    // Find the highest role for their total level
    let correctRoleId = null;
    for (const [level, roleId] of Object.entries(roleAssignments)) {
      if (userTotalLevel >= parseInt(level)) {
        correctRoleId = roleId;
      }
    }
    
    // Remove all level roles except persistent roles and the correct one
    for (const roleId of levelRoleIds) {
      if (member.roles.cache.has(roleId) && roleId !== correctRoleId) {
        // Check if this role should be persistent
        const roleLevel = Object.entries(roleAssignments).find(([level, id]) => id === roleId)?.[0];
        const isPersistent = roleLevel ? persistentRolesConfig[roleLevel] : false;
        
        if (!isPersistent) {
          await member.roles.remove(roleId, 'Level role sync');
          removed++;
          
          // Log the role removal
          const role = guild.roles.cache.get(roleId);
          if (role) {
            await logRoleChange(guild.client, member.id, member.user.tag, 'Removed', role.name, 'Level role sync');
          }
        }
      }
    }
    
    // Add the correct role if missing
    if (correctRoleId && !member.roles.cache.has(correctRoleId)) {
      await member.roles.add(correctRoleId, 'Level role sync');
      added++;
      
      // Log the role addition
      const role = guild.roles.cache.get(correctRoleId);
      if (role) {
        await logRoleChange(guild.client, member.id, member.user.tag, 'Assigned', role.name, 'Level role sync');
      }
    }
  }

  await interaction.editReply({
    content: `✅ Level roles synced for ${checked} members.\nRoles added: ${added}\nRoles removed: ${removed}`
  });
}; 