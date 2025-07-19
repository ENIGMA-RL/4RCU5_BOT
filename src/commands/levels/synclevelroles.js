import { ApplicationCommandOptionType } from 'discord.js';
import fs from 'fs';
import { rolesConfig, levelSettingsConfig } from '../../config/configLoader.js';
import { getUserLevelData } from '../../features/leveling/levelingSystem.js';

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
    const userLevel = userData?.level || 0;
    // Find the highest role for their level
    let correctRoleId = null;
    for (const [level, roleId] of Object.entries(roleAssignments)) {
      if (userLevel >= parseInt(level)) {
        correctRoleId = roleId;
      }
    }
    // Remove all level roles except persistentRoles and the correct one
    for (const roleId of levelRoleIds) {
      if (
        member.roles.cache.has(roleId) &&
        roleId !== correctRoleId &&
        !persistentRoleIds.includes(roleId)
      ) {
        await member.roles.remove(roleId, 'Level role sync');
        removed++;
      }
    }
    // Add the correct role if missing
    if (correctRoleId && !member.roles.cache.has(correctRoleId)) {
      await member.roles.add(correctRoleId, 'Level role sync');
      added++;
    }
  }

  await interaction.editReply({
    content: `✅ Level roles synced for ${checked} members.\nRoles added: ${added}\nRoles removed: ${removed}`
  });
}; 