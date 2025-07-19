import { 
  getUser, 
  createUser, 
  updateUserXP, 
  updateUserLevel, 
  calculateLevel,
  getXPForNextLevel,
  getCurrentLevelXP,
  getTopUsers
} from '../../database/db.js';
import { levelSettingsConfig, channelsConfig, rolesConfig } from '../../config/configLoader.js';

const { leveling } = levelSettingsConfig();

// XP tracking (no cooldowns)

export async function handleMessageXP(member) {
  try {
    const userId = member.id;

    // Get or create user
    let user = getUser(userId);
    if (!user) {
      createUser(userId);
      user = getUser(userId);
    }

    // Calculate new XP and level
    const newXP = user.xp + leveling.xpPerMessage;
    const newLevel = calculateLevel(newXP, leveling.xpThresholds);

    // Update user in database
    updateUserXP(userId, leveling.xpPerMessage, 0);
    
    // Check if level up occurred
    if (newLevel > user.level) {
      await handleLevelUp(member, newLevel, 'message');
    }

    console.log(`📝 ${member.user.tag} gained ${leveling.xpPerMessage} XP (Message)`);
  } catch (error) {
    console.error('Error handling message XP:', error);
  }
}

export async function handleVoiceXP(member) {
  try {
    const userId = member.id;

    // Get or create user
    let user = getUser(userId);
    if (!user) {
      createUser(userId);
      user = getUser(userId);
    }

    // Calculate new voice XP and level
    const newVoiceXP = user.voice_xp + leveling.xpPerMinuteVoice;
    const newVoiceLevel = calculateLevel(newVoiceXP, leveling.xpThresholds);

    // Update user in database
    updateUserXP(userId, 0, leveling.xpPerMinuteVoice);
    
    // Check if voice level up occurred
    if (newVoiceLevel > (user.voice_level || 0)) {
      await handleLevelUp(member, newVoiceLevel, 'voice');
    }

    console.log(`🎤 ${member.user.tag} gained ${leveling.xpPerMinuteVoice} XP (Voice)`);
  } catch (error) {
    console.error('Error handling voice XP:', error);
  }
}

async function handleLevelUp(member, newLevel, type) {
  try {
    const userId = member.id;
    const user = getUser(userId);

    // Get current XP (handle missing properties)
    const currentMessageXP = user.xp || 0;
    const currentVoiceXP = user.voice_xp || 0;

    // Calculate total XP and total level
    const totalXP = currentMessageXP + currentVoiceXP;
    const totalLevel = calculateLevel(totalXP, leveling.xpThresholds);

    // Update levels in database
    if (type === 'message') {
      updateUserLevel(userId, newLevel, user.voice_level || 0, totalLevel);
    } else if (type === 'voice') {
      updateUserLevel(userId, user.level || 0, newLevel, totalLevel);
    }

    // Assign role if applicable (based on total level)
    await assignLevelRole(member, totalLevel);

    // Send level up notification if enabled
    if (user.level_up_notifications) {
      await sendLevelUpNotification(member, newLevel, type);
    }

    console.log(`🎉 ${member.user.tag} reached level ${newLevel} (${type})`);
  } catch (error) {
    console.error('Error handling level up:', error);
  }
}

async function assignLevelRole(member, totalLevel) {
  try {
    // Check if this total level has a role assignment
    const roleId = leveling.roleAssignments[totalLevel.toString()];
    if (!roleId) {
      return; // No role for this total level
    }

    // Get the role
    const role = await member.guild.roles.fetch(roleId);
    if (!role) {
      console.error(`Role ${roleId} not found for total level ${totalLevel}`);
      return;
    }

    // Check if user already has the role
    if (member.roles.cache.has(roleId)) {
      return; // Already has the role
    }

    // Assign the role
    await member.roles.add(role, `Total Level ${totalLevel} achievement`);
    console.log(`🎭 Assigned ${role.name} to ${member.user.tag} for reaching total level ${totalLevel}`);

    // Handle role removal based on new logic (using total level)
    await handleRoleRemoval(member, totalLevel);
  } catch (error) {
    console.error('Error assigning level role:', error);
  }
}

async function handleRoleRemoval(member, currentTotalLevel) {
  try {
    // Get all level roles that should be checked for removal
    const levelNumbers = Object.keys(leveling.roleAssignments)
      .map(Number)
      .filter(level => level < currentTotalLevel)
      .sort((a, b) => b - a); // Sort descending to check highest first

    for (const level of levelNumbers) {
      const roleId = leveling.roleAssignments[level.toString()];
      if (!roleId || !member.roles.cache.has(roleId)) {
        continue; // No role assigned or user doesn't have it
      }

      // Check if this role should be persistent
      const isPersistent = leveling.persistentRoles[level.toString()];
      
      if (!isPersistent) {
        // Find the next higher level role that should replace this one
        const shouldRemove = shouldRemoveRole(level, currentTotalLevel);
        
        if (shouldRemove) {
          const role = await member.guild.roles.fetch(roleId);
          if (role) {
            await member.roles.remove(role, `Replaced by higher total level role`);
            console.log(`🗑️ Removed ${role.name} from ${member.user.tag} (total level ${level} → ${currentTotalLevel})`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error handling role removal:', error);
  }
}

function shouldRemoveRole(roleLevel, currentTotalLevel) {
  // Get all level roles that are higher than the role level but lower than or equal to current total level
  const higherLevels = Object.keys(leveling.roleAssignments)
    .map(Number)
    .filter(level => level > roleLevel && level <= currentTotalLevel)
    .sort((a, b) => a - b); // Sort ascending

  if (higherLevels.length === 0) {
    return false; // No higher level roles to replace this one
  }

  // Find the next immediate higher level role
  const nextHigherLevel = higherLevels[0];
  
  // Check if the next higher level role is persistent
  const nextHigherIsPersistent = leveling.persistentRoles[nextHigherLevel.toString()];
  
  // If the next higher level is persistent, this role should be removed
  // If it's not persistent, we need to check if there's an even higher level that would replace it
  if (nextHigherIsPersistent) {
    return true;
  }

  // If the next higher level is not persistent, check if there's a higher level that would replace it
  const evenHigherLevels = higherLevels.filter(level => level > nextHigherLevel);
  if (evenHigherLevels.length > 0) {
    // There's a higher level that would replace the next higher level, so this role should be removed
    return true;
  }

  return false;
}

async function sendLevelUpNotification(member, level, type) {
  try {
    const channel = await member.guild.channels.fetch(channelsConfig.levelCheckChannelId);
    if (!channel) {
      console.error('Level check channel not found');
      return;
    }

    const embed = {
      title: '🎉 Level Up!',
      description: `Congratulations ${member}! You've reached **Level ${level}** in ${type}!`,
      color: 0xb544ee,
      thumbnail: {
        url: member.user.displayAvatarURL()
      },
      timestamp: new Date().toISOString()
    };

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error sending level up notification:', error);
  }
}

// Utility functions for commands
export function getUserLevelData(userId) {
  const user = getUser(userId);
  if (!user) {
    return null;
  }

  return {
    ...user,
    messageLevel: user.level || 0,
    voiceLevel: user.voice_level || 0,
    totalLevel: user.total_level || 0,
    messageXPForNext: getXPForNextLevel(user.xp || 0, leveling.xpThresholds),
    voiceXPForNext: getXPForNextLevel(user.voice_xp || 0, leveling.xpThresholds),
    messageCurrentLevelXP: getCurrentLevelXP(user.xp || 0, leveling.xpThresholds),
    voiceCurrentLevelXP: getCurrentLevelXP(user.voice_xp || 0, leveling.xpThresholds)
  };
}

export async function getTopUsersByType(type, limit = 10) {
  const users = getTopUsers(limit);
  
  if (type === 'message') {
    return users.sort((a, b) => b.xp - a.xp);
  } else if (type === 'voice') {
    return users.sort((a, b) => b.voice_xp - a.voice_xp);
  } else {
    return users; // Already sorted by total XP
  }
}
