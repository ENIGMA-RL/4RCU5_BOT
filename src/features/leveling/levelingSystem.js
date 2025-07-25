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
import { levelSettingsConfig, channelsConfig } from '../../config/configLoader.js';
import { logRoleChange } from '../../utils/botLogger.js';

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

    // Calculate current total level
    const currentTotalXP = user.xp + user.voice_xp;
    const currentTotalLevel = calculateLevel(currentTotalXP, leveling.xpThresholds);

    // Update user in database
    updateUserXP(userId, leveling.xpPerMessage, 0);
    
    // Calculate new total level
    const newTotalXP = newXP + user.voice_xp;
    const newTotalLevel = calculateLevel(newTotalXP, leveling.xpThresholds);
    
    // Check if total level up occurred (this is what matters for role assignment)
    if (newTotalLevel > currentTotalLevel) {
      console.log(`🎯 Total level up detected for ${member.user.tag}: ${currentTotalLevel} → ${newTotalLevel}`);
      await handleLevelUp(member, newLevel, 'message');
    } else if (newLevel > user.level) {
      console.log(`📈 Message level up detected for ${member.user.tag}: ${user.level} → ${newLevel} (but total level unchanged)`);
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

    // Calculate current total level
    const currentTotalXP = user.xp + user.voice_xp;
    const currentTotalLevel = calculateLevel(currentTotalXP, leveling.xpThresholds);

    // Update user in database
    updateUserXP(userId, 0, leveling.xpPerMinuteVoice);
    
    // Calculate new total level
    const newTotalXP = user.xp + newVoiceXP;
    const newTotalLevel = calculateLevel(newTotalXP, leveling.xpThresholds);
    
    // Check if total level up occurred (this is what matters for role assignment)
    if (newTotalLevel > currentTotalLevel) {
      console.log(`🎯 Total level up detected for ${member.user.tag}: ${currentTotalLevel} → ${newTotalLevel}`);
      await handleLevelUp(member, newVoiceLevel, 'voice');
    } else if (newVoiceLevel > (user.voice_level || 0)) {
      console.log(`📈 Voice level up detected for ${member.user.tag}: ${user.voice_level || 0} → ${newVoiceLevel} (but total level unchanged)`);
      await handleLevelUp(member, newVoiceLevel, 'voice');
    }

    console.log(`🎤 ${member.user.tag} gained ${leveling.xpPerMinuteVoice} XP (Voice)`);
  } catch (error) {
    console.error('Error handling voice XP:', error);
  }
}

async function handleLevelUp(member, newLevel, type) {
  try {
    console.log(`🎉 handleLevelUp called for ${member.user.tag} - newLevel: ${newLevel}, type: ${type}`);
    
    const userId = member.id;
    const user = getUser(userId);

    // Get current XP (handle missing properties)
    const currentMessageXP = user.xp || 0;
    const currentVoiceXP = user.voice_xp || 0;

    // Calculate total XP and total level
    const totalXP = currentMessageXP + currentVoiceXP;
    const totalLevel = calculateLevel(totalXP, leveling.xpThresholds);
    
    console.log(`📊 ${member.user.tag} - Message XP: ${currentMessageXP}, Voice XP: ${currentVoiceXP}, Total XP: ${totalXP}, Total Level: ${totalLevel}`);

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
    console.error('❌ Error handling level up:', error);
  }
}

async function assignLevelRole(member, totalLevel) {
  try {
    console.log(`🎭 Attempting to assign role for ${member.user.tag} (total level: ${totalLevel})`);
    
    // Check if this total level has a role assignment
    const roleId = leveling.roleAssignments[totalLevel.toString()];
    console.log(`🔍 Role assignment for level ${totalLevel}: ${roleId}`);
    
    if (!roleId) {
      console.log(`❌ No role assignment found for total level ${totalLevel}`);
      return; // No role for this total level
    }

    // Get the role
    const role = await member.guild.roles.fetch(roleId);
    if (!role) {
      console.error(`❌ Role ${roleId} not found for total level ${totalLevel}`);
      return;
    }

    console.log(`✅ Found role: ${role.name} (${roleId})`);

    // Check if user already has the role
    if (member.roles.cache.has(roleId)) {
      console.log(`ℹ️ User ${member.user.tag} already has role ${role.name}`);
      return; // Already has the role
    }

    console.log(`🎭 Assigning ${role.name} to ${member.user.tag}...`);
    
    // Assign the role
    await member.roles.add(role, `Total Level ${totalLevel} achievement`);
    console.log(`✅ Successfully assigned ${role.name} to ${member.user.tag} for reaching total level ${totalLevel}`);
    
    // Log the role assignment
    await logRoleChange(member.client, member.id, member.user.tag, 'Assigned', role.name, `Total Level ${totalLevel} achievement`);

    // Handle role removal based on new logic (using total level)
    await handleRoleRemoval(member, totalLevel);
  } catch (error) {
    console.error('❌ Error assigning level role:', error);
  }
}

async function handleRoleRemoval(member, currentTotalLevel) {
  try {
    console.log(`🔍 Checking role removal for ${member.user.tag} (total level: ${currentTotalLevel})`);
    
    // Get all level roles that should be checked for removal
    const levelNumbers = Object.keys(leveling.roleAssignments)
      .map(Number)
      .filter(level => level < currentTotalLevel)
      .sort((a, b) => b - a); // Sort descending to check highest first

    console.log(`📋 Checking levels for removal: ${levelNumbers.join(', ')}`);

    for (const level of levelNumbers) {
      const roleId = leveling.roleAssignments[level.toString()];
      console.log(`🔍 Checking level ${level} (roleId: ${roleId})`);
      
      if (!roleId) {
        console.log(`❌ No role ID found for level ${level}`);
        continue;
      }
      
      if (!member.roles.cache.has(roleId)) {
        console.log(`❌ User doesn't have role ${roleId} for level ${level}`);
        continue; // No role assigned or user doesn't have it
      }

      // Check if this role should be persistent
      const isPersistent = leveling.persistentRoles[level.toString()];
      console.log(`🔒 Level ${level} persistent: ${isPersistent}`);
      
      if (!isPersistent) {
        // Find the next higher level role that should replace this one
        const shouldRemove = shouldRemoveRole(level, currentTotalLevel);
        console.log(`🤔 Should remove level ${level} role: ${shouldRemove}`);
        
        if (shouldRemove) {
          try {
            const role = await member.guild.roles.fetch(roleId);
            if (role) {
              console.log(`🗑️ Attempting to remove ${role.name} from ${member.user.tag}`);
              
              // Check if bot has permission to manage this role
              const botMember = member.guild.members.me;
              if (!botMember.permissions.has('ManageRoles')) {
                console.error(`❌ Bot doesn't have ManageRoles permission`);
                return;
              }
              
              if (role.position >= botMember.roles.highest.position) {
                console.error(`❌ Role ${role.name} is higher than bot's highest role`);
                return;
              }
              
              await member.roles.remove(role, `Replaced by higher total level role`);
              console.log(`✅ Successfully removed ${role.name} from ${member.user.tag} (total level ${level} → ${currentTotalLevel})`);
              
              // Log the role removal
              await logRoleChange(member.client, member.id, member.user.tag, 'Removed', role.name, `Replaced by higher total level role (${level} → ${currentTotalLevel})`);
            } else {
              console.error(`❌ Could not fetch role with ID ${roleId}`);
            }
          } catch (roleError) {
            console.error(`❌ Error removing role ${roleId} from ${member.user.tag}:`, roleError);
          }
        }
      } else {
        console.log(`🔒 Skipping removal of persistent role for level ${level}`);
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

  console.log(`🔍 shouldRemoveRole(${roleLevel}, ${currentTotalLevel}): higherLevels = [${higherLevels.join(', ')}]`);

  if (higherLevels.length === 0) {
    console.log(`❌ No higher level roles found, keeping role level ${roleLevel}`);
    return false; // No higher level roles to replace this one
  }

  // If there are any higher level roles, this role should be removed
  // (unless it's persistent, which is checked in handleRoleRemoval)
  console.log(`✅ Higher level roles found, should remove role level ${roleLevel}`);
  return true;
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
