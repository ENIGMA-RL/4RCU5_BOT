import { EmbedBuilder } from 'discord.js';
import { levelSettingsConfig, rolesConfig } from '../../config/configLoader.js';

export const data = {
  name: 'levels',
  description: 'View information about the XP system and available levels',
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
      .setTitle('🎯 CNS Leveling System')
      .setDescription('Learn about our XP system and the roles you can unlock!')
      .setColor('#ff7bac')
      .setTimestamp()
      .setFooter({ text: 'CNS Bot', iconURL: interaction.client.user.displayAvatarURL() });

    // XP System Info
    embed.addFields({
      name: '📊 XP System',
      value: `• **Message XP**: ${levelSettingsConfig().leveling.xpPerMessage} XP per message\n• **Voice XP**: ${levelSettingsConfig().leveling.xpPerMinuteVoice} XP per minute in voice channels\n• Use \`/rank\` to see your progress\n• Use \`/leaderboard\` to see top players`,
      inline: false
    });

    // Available Levels
    const levelUpRoles = levelSettingsConfig().leveling.levelUpRoles;
    const xpThresholds = levelSettingsConfig().leveling.xpThresholds;
    const roleAssignments = levelSettingsConfig().leveling.roleAssignments;
    
    let levelsText = '';
    for (const [level, roleName] of Object.entries(levelUpRoles)) {
      const xpRequired = xpThresholds[level] || 'N/A';
      const roleId = roleAssignments[level];
      const roleMention = roleId ? `<@&${roleId}>` : roleName;
      levelsText += `• **Level ${level}** (${xpRequired} XP): ${roleMention}\n`;
    }

    embed.addFields({
      name: '🏆 Available Levels',
      value: levelsText,
      inline: false
    });

    // Role Permissions
    let permissionsText = '';
    
    // CNS Newcomer+ permissions
    if (cnsNewcomerRole) {
      permissionsText += `**${cnsNewcomerRole}** and above:\n`;
      permissionsText += '• Embed links\n• Attach files\n\n';
    }

    // CNS Member+ permissions
    if (cnsMemberRole) {
      permissionsText += `**${cnsMemberRole}** and above:\n`;
      permissionsText += '• Add reactions\n• Create threads\n• Create voice channels\n\n';
    }

    // CNS Official permissions
    if (cnsOfficialRole) {
      permissionsText += `**${cnsOfficialRole}**:\n`;
      permissionsText += '• Use external emotes\n• Use stickers\n• Change nickname\n\n';
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

    specialNotes += '• All members can use basic commands like `/help`, `/levels`, `/invite`, `/rank`, and `/leaderboard`';

    embed.addFields({
      name: '📝 Special Notes',
      value: specialNotes,
      inline: false
    });

    embed.addFields(
      { name: '🔊 Join to Create', value: 'CNS Member+ can join the special channel to create their own temporary voice channel. Use /vc commands to manage it!' }
    );

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in levels command:', error);
    await interaction.reply({
      content: '❌ An error occurred while fetching level information.',
      flags: 64
    });
  }
}; 