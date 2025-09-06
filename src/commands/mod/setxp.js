import { ApplicationCommandOptionType } from 'discord.js';
import { updateUserXP, updateUserLevel, getUser, createUser } from '../../repositories/usersRepo.js';
import { levelSettingsConfig } from '../../config/configLoader.js';

function calculateLevel(xp, thresholds) {
  if (!thresholds || thresholds.length === 0) return 1;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) return i + 1;
  }
  return 1;
}
import { rolesConfig, botConfig } from '../../config/configLoader.js';

export const data = {
  name: 'setxp',
  description: 'DEV ONLY: Set a user\'s XP to specific values',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.User,
      description: 'The user to set XP for',
      required: true,
    },
    {
      name: 'message_xp',
      type: ApplicationCommandOptionType.Integer,
      description: 'Message XP to set',
      required: true,
      min_value: 0,
    },
    {
      name: 'voice_xp',
      type: ApplicationCommandOptionType.Integer,
      description: 'Voice XP to set',
      required: true,
      min_value: 0,
    },
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    // Check if user has CNS Developer role AND is the bot owner
    const memberRoles = interaction.member.roles.cache;
    const isCnsDev = memberRoles.has(rolesConfig().cnsDeveloperRole);
    const isBotOwner = interaction.user.id === botConfig().ownerID;
    
    if (!isCnsDev || !isBotOwner) {
      await interaction.reply({
        content: '❌ You are not authorized to use this command.',
        flags: 64
      });
      return;
    }

    const targetUser = interaction.options.getUser('user');
    const messageXP = interaction.options.getInteger('message_xp');
    const voiceXP = interaction.options.getInteger('voice_xp');

    // Get or create user in database
    let user = getUser(targetUser.id);
    if (!user) {
      createUser(targetUser.id);
      user = getUser(targetUser.id);
    }

    // Calculate levels based on XP
    const levelSettings = levelSettingsConfig();
    const messageLevel = calculateLevel(messageXP, levelSettings.leveling.xpThresholds);
    const voiceLevel = calculateLevel(voiceXP, levelSettings.leveling.xpThresholds);
    const totalLevel = messageLevel + voiceLevel;

    // Update user XP and levels
    // First, reset to 0, then add the new values
    updateUserXP(targetUser.id, -user.xp, -user.voice_xp); // Reset to 0
    updateUserXP(targetUser.id, messageXP, voiceXP); // Set new values
    updateUserLevel(targetUser.id, messageLevel, voiceLevel, totalLevel);

    await interaction.reply({
      content: `✅ Set XP for ${targetUser.tag}:\n📝 Message XP: ${messageXP} (Level ${messageLevel})\n🎤 Voice XP: ${voiceXP} (Level ${voiceLevel})\n📊 Total XP: ${messageXP + voiceXP} (Total Level ${totalLevel})`,
      flags: 64
    });

  } catch (error) {
    console.error('Error in setxp command:', error);
    await interaction.reply({
      content: '❌ An error occurred while setting XP.',
      flags: 64
    });
  }
}; 