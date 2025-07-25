import { ApplicationCommandOptionType, PermissionFlagsBits } from 'discord.js';
import { logModerationAction } from '../../utils/moderationLogger.js';
import { rolesConfig } from '../../config/configLoader.js';

export const data = {
  name: 'unban',
  description: 'Unbans a user from the server (format: @username)',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.String,
      description: 'The user to unban (e.g., @username)',
      required: true,
    },
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  // Check if user has admin or mod permissions
  const memberRoles = interaction.member.roles.cache;
  const isAdmin = rolesConfig().adminRoles.some(roleId => memberRoles.has(roleId));
  const isMod = rolesConfig().modRoles.some(roleId => memberRoles.has(roleId));
  
  if (!isAdmin && !isMod) {
    await interaction.reply({
      content: '❌ You need admin or mod permissions to use this command.',
      flags: 64
    });
    return;
  }

  const input = interaction.options.getString('user');
  
  // Parse the input to extract user mention
  const mentionMatch = input.match(/<@!?\d+>/);
  if (!mentionMatch) {
    await interaction.reply({ 
      content: 'Please mention a user with @username.', 
      flags: 64 
    });
    return;
  }
  
  const userId = mentionMatch[1];
  
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (!user) {
    await interaction.reply({ 
      content: 'Could not find the specified user.', 
      flags: 64 
    });
    return;
  }
  
  // Check if the bot can unban users
  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
    await interaction.reply({ 
      content: 'I need the Ban Members permission to unban users.', 
      flags: 64 
    });
    return;
  }

  try {
    // Unban the user
    await interaction.guild.members.unban(userId, `Unbanned by ${interaction.user.tag}`);
    
    // Log the action and send DM
    await logModerationAction(
      interaction.client,
      'Unban',
      user,
      interaction.user,
      `Unbanned by ${interaction.user.tag}`
    );

    await interaction.reply({ 
      content: `✅ Successfully unbanned ${user.tag}`, 
      flags: 64 
    });

  } catch (error) {
    console.error('Error unbanning user:', error);
    await interaction.reply({ 
      content: 'Failed to unban the user. Please check my permissions.', 
      flags: 64 
    });
  }
}; 