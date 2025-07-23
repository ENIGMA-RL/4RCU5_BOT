import { EmbedBuilder, ApplicationCommandOptionType } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';

export const data = {
  name: 'help',
  description: 'Shows all available commands based on your roles',
  options: [],
  // defaultMemberPermissions: null // Allow everyone to use this command (remove or leave as null for public)
};

export const execute = async (interaction) => {
  try {
    const memberRoles = interaction.member.roles.cache;
    
    const hasModRole = rolesConfig().sayCommandRoles.some(role => memberRoles.has(role));
    
    // Check specific roles for different permission levels using config
    const isAdmin = rolesConfig().adminRoles.some(roleId => memberRoles.has(roleId));
    const isMod = rolesConfig().modRoles.some(roleId => memberRoles.has(roleId));
    const isHelper = memberRoles.has(rolesConfig().helperRole);
    
    // Create embed based on user's role level
    const embed = new EmbedBuilder()
      .setTitle('🤖 CNS Bot Commands')
      .setColor('#b544ee')
      .setTimestamp();

    // General Commands (available to everyone)
    const generalCommands = [
      { name: '/help', description: 'Shows this help menu' },
      { name: '/ping', description: 'Check bot latency' },
      { name: '/info', description: 'Get bot information' },
      { name: '/funfact', description: 'Get a random useless fun fact!' },
      { name: '/birthday', description: 'Set your birthday to receive birthday wishes and a special role!' },
      { name: '/levels', description: 'View information about the XP system and available levels' },
      { name: '/rank', description: 'Check your level and XP' },
      { name: '/leaderboard', description: 'View server leaderboard' }
    ];

    embed.addFields({
      name: '📋 General Commands',
      value: generalCommands.map(cmd => `**${cmd.name}** - ${cmd.description}`).join('\n') +
        '\n\n*Automod: Messages containing Discord invite links will be automatically deleted and the user will be notified in private.*',
      inline: false
    });

    // Voice Channel Commands (available to everyone)
    const vcCommands = [
      { name: '/lock', description: 'Lock voice channel (owner only)' },
      { name: '/unlock', description: 'Unlock voice channel (owner only)' },
      { name: '/limit', description: 'Set voice channel user limit (owner only)' },
      { name: '/rename', description: 'Rename voice channel (owner only)' },
      { name: '/transfer', description: 'Transfer voice channel ownership (owner only)' },
      { name: '/vc-claim', description: 'Claim ownership if the owner has left' },
      { name: '/vc-allow', description: 'Allow a user to join your locked channel (owner only)' }
    ];

    embed.addFields({
      name: '🎤 Voice Channel Commands',
      value: vcCommands.map(cmd => `**${cmd.name}** - ${cmd.description}`).join('\n') +
        '\n\n*Only the channel owner can use /lock, /unlock, /limit, /rename, /transfer, and /vc-allow. Use /vc-claim to claim ownership if the owner leaves the channel. Use /vc-allow to permit specific users to join your locked channel.*' +
        '\n\n__**Note:**__ Only users with the CNS Rookie role or higher can create a voice channel using the join-to-create system.' ,
      inline: false
    });



    // Moderation Commands (only for staff members)
    if (hasModRole) {
      const modCommands = [
        { name: '/kick', description: 'Kick a user (format: @username reason)' },
        { name: '/ban', description: 'Ban a user (format: @username reason)' },
        { name: '/timeout', description: 'Timeout a user (format: @username duration)' },
        { name: '/untimeout', description: 'Remove timeout from user (format: @username)' },
        { name: '/unban', description: 'Unban a user (format: @username or user_id)' },
        { name: '/tag-sync', description: 'Manually trigger tag role synchronization (mod/dev only)' }
      ];

      embed.addFields({
        name: '⚖️ Moderation Commands',
        value: modCommands.map(cmd => `**${cmd.name}** - ${cmd.description}`).join('\n'),
        inline: false
      });
    }

    // Admin Commands (only for admins)
    if (isAdmin) {
      const adminCommands = [
        { name: '/role-assign', description: 'Assign a role to another user (format: @username role_name)' },
        { name: '/role-remove', description: 'Remove a role from another user (format: @username role_name)' },
        { name: '/say', description: 'Send a message as the bot' },
        { name: '/refreshstaff', description: 'Refresh the staff embed' },
        { name: '/refreshstats', description: 'Refresh the server statistics embed' }
      ];

      embed.addFields({
        name: '👑 Admin Commands',
        value: adminCommands.map(cmd => `**${cmd.name}** - ${cmd.description}`).join('\n'),
        inline: false
      });
    }

    // Developer Commands (only for CNS Developer role)
    const isDev = memberRoles.has(rolesConfig().cnsDeveloperRole);
    if (isDev) {
      const devCommands = [
        { name: '/purge', description: 'Deletes all messages from the current channel (CNS Developer only)' },
        { name: '/setbackground', description: 'Upload a background image for rank cards (CNS Developer only)' },
        { name: '/tag-sync', description: 'Manually sync CNS tag roles based on tag guild membership (CNS Developer only)' },
        { name: '/migrate-message-xp', description: 'DEV ONLY: Count all messages per user and update message XP accordingly' },
        { name: '/sync-level-roles', description: 'Sync level roles for all members (CNS Developer only)' },
        { name: '/dev-xp-leaderboard', description: 'Dev-only: View the top 50 members by total XP (paginated, private)' },
        { name: '/recalculate-levels', description: 'Dev-only: Recalculate and update all user levels and totalLevel in the database' }
      ];
      embed.addFields({
        name: '🛠️ Developer Commands',
        value: devCommands.map(cmd => `**${cmd.name}** - ${cmd.description}`).join('\n'),
        inline: false
      });
    }

    // Set description based on user's role level
    if (isDev) {
      embed.setDescription('**🛠️ Developer Access** - You have access to all developer, admin, and moderation commands.');
    } else if (isAdmin) {
      embed.setDescription('**👑 Admin Access** - You have access to all commands including full moderation and staff tools.');
    } else if (isMod) {
      embed.setDescription('**⚡ Moderator Access** - You have access to moderation commands and staff tools.');
    } else if (isHelper) {
      embed.setDescription('**🤝 Helper Access** - You have access to basic staff commands and moderation tools.');
    } else if (hasModRole) {
      embed.setDescription('**🛡️ Staff Access** - You have access to staff commands and moderation tools.');
    } else {
      embed.setDescription('**👤 Member Access** - You have access to general commands and voice channel management.');
    }

    // Add footer with role information
    const userRoles = memberRoles.map(role => role.name).join(', ');
    embed.setFooter({ 
      text: `Your roles: ${userRoles || 'None'}`, 
      iconURL: interaction.user.displayAvatarURL() 
    });

    await interaction.reply({
      embeds: [embed],
      flags: 64
    });

  } catch (error) {
    console.error('Error in help command:', error);
    await interaction.reply({
      content: '❌ An error occurred while generating the help menu.',
      flags: 64
    });
  }
}; 