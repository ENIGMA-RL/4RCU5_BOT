import { EmbedBuilder } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';

export const data = {
  name: 'roles',
  description: 'View information about CNS roles and their permissions',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    // Get role mentions
    const cnsNewcomerRole = interaction.guild.roles.cache.get(rolesConfig().levelRoles.cnsNewcomer);
    const cnsMemberRole = interaction.guild.roles.cache.get(rolesConfig().levelRoles.cnsMember);
    const cnsOfficialRole = interaction.guild.roles.cache.get(rolesConfig().cnsOfficialRole);
    const cnsSpecialMemberRole = interaction.guild.roles.cache.get(rolesConfig().cnsSpecialMemberRole);

    const embed = new EmbedBuilder()
      .setTitle('🔐 CNS Role Permissions')
      .setDescription('Learn about the different roles and what they unlock!')
      .setColor('#ff7bac')
      .setTimestamp()
      .setFooter({ text: '4RCU5', iconURL: interaction.client.user.displayAvatarURL() });

    // Role Permissions
    let permissionsText = '';
    
    // CNS Newcomer+ permissions
    if (cnsNewcomerRole) {
      permissionsText += `**${cnsNewcomerRole}**\n`;
      permissionsText += '• Embed links\n• Attach files\n• Add reactions\n\n';
    }

    // CNS Rookie+ permissions
    const cnsRookieRole = interaction.guild.roles.cache.get(rolesConfig().levelRoles.cnsRookie);
    if (cnsRookieRole) {
      permissionsText += `**${cnsRookieRole}** and above:\n`;
      permissionsText += '• Create voice channels\n\n';
    }

    // CNS Member+ permissions
    if (cnsMemberRole) {
      permissionsText += `**${cnsMemberRole}** and above:\n`;
      permissionsText += '• Create threads\n• Use external emotes\n• Participate in giveaways\n\n';
    }

    // CNS Official permissions
    if (cnsOfficialRole) {
      permissionsText += `**${cnsOfficialRole}**:\n`;
      permissionsText += '• Use stickers\n• Change nickname\n• CNS Official Lounge\n• Use external emotes\n• Participate in giveaways\n\n';
    }

    // CNS Special Member permissions
    if (cnsSpecialMemberRole) {
      permissionsText += `**${cnsSpecialMemberRole}**:\n`;
      permissionsText += '• Create polls\n• Change nickname\n\n';
    }

    embed.addFields({
      name: '🔐 Role Permissions',
      value: permissionsText,
      inline: false
    });

    // Special Notes
    let specialNotes = '';
    
    if (cnsOfficialRole) {
      specialNotes += `• **${cnsOfficialRole}** can only be obtained when you have the CNS server tag equipped\n`;
      specialNotes += '• It will be removed when you unequip the server tag\n\n';
    }

    if (cnsSpecialMemberRole) {
      specialNotes += `• **${cnsSpecialMemberRole}** is reserved for Server Boosters\n\n`;
    }

    specialNotes += '• All members can use basic commands like `/help`, `/roles`, `/invite`, `/rank`, and `/leaderboard`';

    embed.addFields({
      name: '📝 Special Notes',
      value: specialNotes,
      inline: false
    });

    embed.addFields(
      { name: '🔊 Join to Create', value: 'CNS Rookie+ can join the "Join to Create" channel to create their own temporary voice channel. Use /vc commands to manage it!' }
    );

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in roles command:', error);
    await interaction.reply({
      content: '❌ An error occurred while fetching role information.',
      flags: 64
    });
  }
}; 