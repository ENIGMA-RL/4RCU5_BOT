import { EmbedBuilder } from 'discord.js';
import { calculateLevel, updateUserLevel, getTopUsers } from '../../database/db.js';
import { levelSettingsConfig } from '../../config/configLoader.js';
import { rolesConfig } from '../../config/configLoader.js';

export const data = {
  name: 'recalculate-levels',
  description: 'Dev-only: Recalculate and update all user levels and totalLevel in the database',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  // Dev-only check
  const devRoleId = rolesConfig().cnsDeveloperRole;
  if (!interaction.member.roles.cache.has(devRoleId)) {
    await interaction.reply({
      content: '❌ Only users with the CNS Developer role can use this command.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const levelSettings = levelSettingsConfig();
  const xpThresholds = levelSettings.leveling.xpThresholds;
  const users = getTopUsers(10000);
  let updated = 0;

  for (const user of users) {
    const messageXP = user.xp || 0;
    const voiceXP = user.voice_xp || 0;
    const messageLevel = calculateLevel(messageXP, xpThresholds);
    const voiceLevel = calculateLevel(voiceXP, xpThresholds);
    const totalLevel = messageLevel + voiceLevel;
    updateUserLevel(user.user_id, messageLevel, voiceLevel, totalLevel);
    updated++;
  }

  const embed = new EmbedBuilder()
    .setTitle('🛠️ Level Recalculation Complete')
    .setDescription(`Recalculated and updated levels for **${updated}** users.`)
    .setColor('#b544ee')
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}; 