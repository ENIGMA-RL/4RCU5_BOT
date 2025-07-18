import { ApplicationCommandOptionType } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';

export const data = {
  name: 'role-remove',
  description: 'Removes a role from a user (Admin only)',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.User,
      description: 'The user to remove the role from',
      required: true,
    },
    {
      name: 'role',
      type: ApplicationCommandOptionType.Role,
      description: 'The role to remove',
      required: true,
    },
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    // Check if user has admin permissions
    const memberRoles = interaction.member.roles.cache;
    const isAdmin = rolesConfig().adminRoles.some(roleId => memberRoles.has(roleId));
    
    if (!isAdmin) {
      await interaction.reply({
        content: '❌ You need admin permissions to use this command.',
        flags: 64
      });
      return;
    }

    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const targetMember = await interaction.guild.members.fetch(user.id);

    if (!targetMember) {
      await interaction.reply({
        content: '❌ User not found in this server.',
        flags: 64
      });
      return;
    }

    if (!role) {
      await interaction.reply({
        content: '❌ Role not found.',
        flags: 64
      });
      return;
    }

    // Check if bot can manage this role
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        content: '❌ I don\'t have permission to manage roles.',
        flags: 64
      });
      return;
    }

    // Check if bot's role is higher than the role being removed
    const botRole = interaction.guild.members.me.roles.highest;
    if (role.position >= botRole.position) {
      await interaction.reply({
        content: '❌ I cannot remove a role that is higher than or equal to my highest role.',
        flags: 64
      });
      return;
    }

    // Check if user has the role
    if (!targetMember.roles.cache.has(role.id)) {
      await interaction.reply({
        content: `❌ ${user.username} doesn't have the ${role.name} role.`,
        flags: 64
      });
      return;
    }

    // Remove the role
    await targetMember.roles.remove(role);
    
    await interaction.reply({
      content: `✅ Successfully removed the **${role.name}** role from ${user.username}.`,
      flags: 64
    });

    // Log the action
    console.log(`Role removed: ${interaction.user.tag} removed ${role.name} from ${user.tag}`);

  } catch (error) {
    console.error('Error in role-remove command:', error);
    await interaction.reply({
      content: '❌ An error occurred while removing the role.',
      flags: 64
    });
  }
}; 