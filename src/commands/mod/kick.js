import { ApplicationCommandOptionType, PermissionFlagsBits } from 'discord.js';
import { logModerationAction } from '../../utils/moderationLogger.js';
import rolesConfig from '../../config/roles.json' with { type: 'json' };

export const data = {
  name: 'kick',
  description: 'Kicks a user from the server (format: @username reason)',
  options: [
    {
      name: 'user_and_reason',
      type: ApplicationCommandOptionType.String,
      description: 'The user to kick and reason (e.g., @username Breaking rules)',
      required: true,
    },
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  // Check if user has admin or mod permissions
  const memberRoles = interaction.member.roles.cache;
  const isAdmin = rolesConfig.adminRoles.some(roleId => memberRoles.has(roleId));
  const isMod = rolesConfig.modRoles.some(roleId => memberRoles.has(roleId));
  
  if (!isAdmin && !isMod) {
    await interaction.reply({
      content: '❌ You need admin or mod permissions to use this command.',
      flags: 64
    });
    return;
  }

  const input = interaction.options.getString('user_and_reason');
  
  // Parse the input to extract user mention and reason
  const mentionMatch = input.match(/<@!?(\d+)>/);
  if (!mentionMatch) {
    await interaction.reply({ 
      content: 'Please mention a user with @username followed by the reason.', 
      flags: 64 
    });
    return;
  }
  
  const userId = mentionMatch[1];
  const reason = input.replace(/<@!?\d+>\s*/, '').trim() || 'No reason provided';
  
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (!user) {
    await interaction.reply({ 
      content: 'Could not find the specified user.', 
      flags: 64 
    });
    return;
  }
  
  const member = await interaction.guild.members.fetch(userId);
  if (!member) {
    await interaction.reply({ 
      content: 'That user is not a member of this server.', 
      flags: 64 
    });
    return;
  }
  
  // Check if the bot can kick the user
  if (!member.kickable) {
    await interaction.reply({ 
      content: 'I cannot kick this user. They may have higher permissions than me.', 
      flags: 64 
    });
    return;
  }
  
  try {
    // Kick the user
    await member.kick(reason);
    
    // Log the action and send DM
    await logModerationAction(
      interaction.client,
      'Kick',
      user,
      interaction.user,
      reason
    );
    
    // Send invisible feedback to the moderator
    await interaction.reply({ 
      content: `✅ Successfully kicked ${user.tag} for: ${reason}`, 
      flags: 64 
    });
    
  } catch (error) {
    console.error('Error kicking user:', error);
    await interaction.reply({ 
      content: 'Failed to kick the user. Please check my permissions.', 
      flags: 64 
    });
  }
}; 