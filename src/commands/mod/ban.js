import { ApplicationCommandOptionType } from 'discord.js';
import { logModerationAction } from '../../utils/moderationLogger.js';
import { rolesConfig } from '../../config/configLoader.js';

export const data = {
  name: 'ban',
  description: 'Bans a user from the server (format: @username reason)',
  options: [
    {
      name: 'user_and_reason',
      type: ApplicationCommandOptionType.String,
      description: 'The user to ban and reason (e.g., @username Breaking rules)',
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
  
  // Check if the bot can ban the user
  if (!member.bannable) {
    await interaction.reply({ 
      content: 'I cannot ban this user. They may have higher permissions than me.', 
      flags: 64 
    });
    return;
  }
  
  try {
    // Ban the user
    await member.ban({ reason });
    
    // Log the action and send DM
    await logModerationAction(
      interaction.client,
      'Ban',
      user,
      interaction.user,
      reason
    );
    
    // Send invisible feedback to the moderator
    await interaction.reply({ 
      content: `✅ Successfully banned ${user.tag} for: ${reason}`, 
      flags: 64 
    });
    
  } catch (error) {
    console.error('Error banning user:', error);
    await interaction.reply({ 
      content: 'Failed to ban the user. Please check my permissions.', 
      flags: 64 
    });
  }
}; 