import { ApplicationCommandOptionType } from 'discord.js';
import { logModerationAction } from '../../utils/moderationLogger.js';
import { rolesConfig } from '../../config/configLoader.js';

export const data = {
  name: 'timeout',
  description: 'Timeouts a user (format: @username duration)',
  options: [
    {
      name: 'user_and_duration',
      type: ApplicationCommandOptionType.String,
      description: 'The user to timeout and duration (e.g., @username 1h)',
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

  const input = interaction.options.getString('user_and_duration');
  
  // Parse the input to extract user mention and duration
  const mentionMatch = input.match(/<@!?\d+>/);
  if (!mentionMatch) {
    await interaction.reply({ 
      content: 'Please mention a user with @username followed by the duration.', 
      flags: 64 
    });
    return;
  }
  
  const userId = mentionMatch[1];
  const durationStr = input.replace(/<@!?\d+>\s*/, '').trim();
  const durationMs = parseDuration(durationStr);

  if (!durationMs) {
    await interaction.reply({ 
      content: 'Invalid duration format. Please specify a valid duration.', 
      flags: 64 
    });
    return;
  }
  
  // Check if duration is within limits (max 28 days)
  if (durationMs > 28 * 24 * 60 * 60 * 1000) {
    await interaction.reply({ 
      content: 'Duration cannot exceed 28 days.', 
      flags: 64 
    });
    return;
  }
  
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
  
  // Check if the bot can timeout the user
  if (!member.moderatable) {
    await interaction.reply({ 
      content: 'I cannot timeout this user. They may have higher permissions than me.', 
      flags: 64 
    });
    return;
  }

  try {
    // Timeout the user
    await member.timeout(durationMs, `Timeout by ${interaction.user.tag}`);
    
    // Log the action and send DM
    await logModerationAction(
      interaction.client,
      'Timeout',
      user,
      interaction.user,
      `${durationStr} timeout`
    );
    
    // Send invisible feedback to the moderator
    await interaction.reply({ 
      content: `✅ Successfully timed out ${user.tag} for ${durationStr}`, 
      flags: 64 
    });

  } catch (error) {
    console.error('Error timing out user:', error);
    await interaction.reply({ 
      content: 'Failed to timeout the user. Please check my permissions.', 
      flags: 64 
    });
  }
};

// Helper function to parse duration strings
function parseDuration(durationStr) {
  const timeUnits = {
    's': 1000,           // seconds
    'sec': 1000,
    'seconds': 1000,
    'm': 60 * 1000,      // minutes
    'min': 60 * 1000,
    'minutes': 60 * 1000,
    'h': 60 * 60 * 1000, // hours
    'hr': 60 * 60 * 1000,
    'hours': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000, // days
    'days': 24 * 60 * 60 * 1000
  };

  const match = durationStr.match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  if (timeUnits[unit]) {
    return value * timeUnits[unit];
  }

  return null;
} 