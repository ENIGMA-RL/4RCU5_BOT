import { commandCooldownsConfig } from '../config/configLoader.js';
import { getCooldownDuration } from './cooldownStorage.js';

// In-memory storage for cooldowns (userId -> command -> timestamp)
const cooldowns = new Map();

/**
 * Check if a user is on cooldown for a specific command
 * @param {string} userId - The user's ID
 * @param {string} commandName - The command name
 * @param {number} cooldownMinutes - Cooldown duration in minutes
 * @param {Array} memberRoles - Array of role IDs the member has
 * @returns {Object} - { onCooldown: boolean, remainingTime?: number }
 */
export function checkCooldown(userId, commandName, cooldownMinutes, memberRoles = []) {
  // Check if user has staff roles (exempt from cooldown)
  const cooldownConfig = commandCooldownsConfig();
  if (cooldownConfig.staffExemptions?.enabled) {
    const staffRoles = cooldownConfig.staffExemptions.roles;
    const hasStaffRole = memberRoles.some(roleId => staffRoles.includes(roleId));
    
    if (hasStaffRole) {
      return { onCooldown: false };
    }
  }

  const userCooldowns = cooldowns.get(userId) || new Map();
  const lastUsed = userCooldowns.get(commandName);
  
  if (!lastUsed) {
    return { onCooldown: false };
  }

  const cooldownMs = cooldownMinutes * 60 * 1000;
  const timeSinceLastUse = Date.now() - lastUsed;
  const remainingTime = cooldownMs - timeSinceLastUse;

  if (remainingTime > 0) {
    return { onCooldown: true, remainingTime };
  }

  return { onCooldown: false };
}

/**
 * Set a cooldown for a user and command
 * @param {string} userId - The user's ID
 * @param {string} commandName - The command name
 */
export function setCooldown(userId, commandName) {
  if (!cooldowns.has(userId)) {
    cooldowns.set(userId, new Map());
  }
  
  const userCooldowns = cooldowns.get(userId);
  userCooldowns.set(commandName, Date.now());
}

/**
 * Format remaining time in a human-readable format
 * @param {number} remainingMs - Remaining time in milliseconds
 * @returns {string} - Formatted time string
 */
export function formatRemainingTime(remainingMs) {
  const minutes = Math.floor(remainingMs / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Clear all cooldowns (useful for testing or maintenance)
 */
export function clearAllCooldowns() {
  cooldowns.clear();
}

/**
 * Get cooldown statistics (for debugging)
 * @returns {Object} - Cooldown statistics
 */
export function getCooldownStats() {
  const stats = {
    totalUsers: cooldowns.size,
    totalCooldowns: 0
  };
  
  for (const userCooldowns of cooldowns.values()) {
    stats.totalCooldowns += userCooldowns.size;
  }
  
  return stats;
} 