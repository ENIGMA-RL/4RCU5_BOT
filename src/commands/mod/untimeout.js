import { ApplicationCommandOptionType } from 'discord.js';
import { logModerationAction } from '../../utils/moderationLogger.js';
import { rolesConfig } from '../../config/configLoader.js';
import { isAdmin, isMod } from '../../utils/permissions.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'untimeout',
  description: 'Removes timeout from a user (format: @username)',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.String,
      description: 'The user to remove timeout from (e.g., @username)',
      required: true,
    },
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  // Check if user has admin or mod permissions
  const canAdmin = isAdmin(interaction.member);
  const canMod = isMod(interaction.member);
  
  if (!canAdmin && !canMod) {
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
  
  const member = await interaction.guild.members.fetch(userId);
  if (!member) {
    await interaction.reply({ 
      content: 'That user is not a member of this server.', 
      flags: 64 
    });
    return;
  }
  
  // Check if the user is timed out
  if (!member.isCommunicationDisabled()) {
    await interaction.reply({ 
      content: 'That user is not currently timed out.', 
      flags: 64 
    });
    return;
  }
  
  // Check if the bot can timeout the user
  if (!member.moderatable) {
    await interaction.reply({ 
      content: 'I cannot remove timeout from this user. They may have higher permissions than me.', 
      flags: 64 
    });
    return;
  }

  try {
    // Remove timeout
    await member.timeout(null, `Timeout removed by ${interaction.user.tag}`);
    
    // Log the action and send DM
    await logModerationAction(
      interaction.client,
      'Untimeout',
      user,
      interaction.user,
      `Timeout removed by ${interaction.user.tag}`
    );

    await interaction.reply({ 
      content: `✅ Successfully removed timeout from ${user.tag}`, 
      flags: 64 
    });

  } catch (error) {
    logger.error({ err: error }, 'Error removing timeout');
    await interaction.reply({ 
      content: 'Failed to remove timeout. Please check my permissions.', 
      flags: 64 
    });
  }
}; 