import { ApplicationCommandOptionType } from 'discord.js';
import { logModerationAction } from '../../utils/moderationLogger.js';
import { rolesConfig } from '../../config/configLoader.js';
import { markUserLeftServer } from '../../database/db.js';

export const data = {
  name: 'ban',
  description: 'Ban a user from the server',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.User,
      description: 'The user to ban',
      required: true,
    },
    {
      name: 'reason',
      type: ApplicationCommandOptionType.String,
      description: 'Reason for the ban',
      required: false,
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

  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
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
    // Mark inactive in DB
    try { markUserLeftServer(user.id); } catch {}
    
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
      content: `✅ Successfully banned ${user.tag}\n📝 Reason: ${reason}`, 
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