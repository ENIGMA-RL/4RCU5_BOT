import { rolesConfig } from '../../config/configLoader.js';
import { syncLevelRoles } from '../../features/leveling/levelRoleSync.js';

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
  
  try {
    const result = await syncLevelRoles(guild);
    await interaction.editReply({
      content: `✅ Level roles synced for ${result.checked} members.\nRoles added: ${result.added}\nRoles removed: ${result.removed}`
    });
  } catch (error) {
    console.error('Error during manual level role sync:', error);
    await interaction.editReply({
      content: '❌ An error occurred while syncing level roles. Check the console for details.'
    });
  }
}; 