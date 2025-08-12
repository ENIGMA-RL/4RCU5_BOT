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
    const embed = new EmbedBuilder()
      .setTitle('🎯 CNS Leveling System')
      .setDescription('Learn about our XP system and the roles you can unlock!')
      .setColor('#ff7bac')
      .setTimestamp()
      .setFooter({ text: '4RCU5', iconURL: interaction.client.user.displayAvatarURL() });

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

    // Reference to roles command
    embed.addFields({
      name: '📚 More Information',
      value: 'Use `/roles` to see detailed information about role permissions and special features!',
      inline: false
    });

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in levels command:', error);
    await interaction.reply({
      content: '❌ An error occurred while fetching level information.',
      flags: 64
    });
  }
}; 