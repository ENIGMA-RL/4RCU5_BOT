import { ApplicationCommandOptionType } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';
import { isAdmin } from '../../utils/permissions.js';
import { check as cdCheck, set as cdSet, formatRemaining as cdFormat } from '../../services/CooldownService.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'role-assign',
  description: 'Assigns a role to a user (Admin only)',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.User,
      description: 'The user to assign the role to',
      required: true,
    },
    {
      name: 'role',
      type: ApplicationCommandOptionType.Role,
      description: 'The role to assign',
      required: true,
    },
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    // Check if user has admin permissions
    const canAdmin = isAdmin(interaction.member);
    
    if (!canAdmin) {
      await interaction.reply({
        content: '❌ You need admin permissions to use this command.',
        flags: 64
      });
      return;
    }

    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    // Rate-limit member fetches
    const res = cdCheck(interaction.member, 'role-assign');
    if (res.onCooldown) {
      const remaining = cdFormat(res.remainingTime);
      await interaction.reply({ content: `⏰ Try again in ${remaining}`, flags: 64 });
      return;
    }
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

    // Check if bot's role is higher than the role being assigned
    const botRole = interaction.guild.members.me.roles.highest;
    if (role.position >= botRole.position) {
      await interaction.reply({
        content: '❌ I cannot assign a role that is higher than or equal to my highest role.',
        flags: 64
      });
      return;
    }

    // Check if user already has the role
    if (targetMember.roles.cache.has(role.id)) {
      await interaction.reply({
        content: `❌ ${user.username} already has the ${role.name} role.`,
        flags: 64
      });
      return;
    }

    // Assign the role
    await targetMember.roles.add(role);
    cdSet(interaction.member, 'role-assign');
    
    await interaction.reply({
      content: `✅ Successfully assigned the **${role.name}** role to ${user.username}.`,
      flags: 64
    });

    // Log the action
    logger.info(`Role assigned: ${interaction.user.tag} assigned ${role.name} to ${user.tag}`);

  } catch (error) {
    logger.error({ err: error }, 'Error in role-assign command');
    await interaction.reply({
      content: '❌ An error occurred while assigning the role.',
      flags: 64
    });
  }
}; 