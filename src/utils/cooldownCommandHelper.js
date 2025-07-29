import { commandCooldownsConfig } from '../config/configLoader.js';

/**
 * Get available commands for cooldown management
 * @returns {Array} Array of command choice objects
 */
export function getCooldownCommandChoices() {
  const config = commandCooldownsConfig();
  const commands = Object.keys(config.commands || {});
  
  return commands.map(cmd => ({
    name: `${cmd} (${config.commands[cmd].durationMinutes}m)`,
    value: cmd
  }));
}

/**
 * Parse duration string (e.g., "30m", "2h", "1d")
 * @param {string} durationStr - Duration string to parse
 * @returns {number} Duration in milliseconds
 * @throws {Error} If duration format is invalid
 */
export function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)([mhd])$/);
  if (!match) {
    throw new Error('Invalid duration format. Use format like "30m", "2h", "1d"');
  }
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 'm': return value * 60 * 1000; // minutes to milliseconds
    case 'h': return value * 60 * 60 * 1000; // hours to milliseconds
    case 'd': return value * 24 * 60 * 60 * 1000; // days to milliseconds
    default: throw new Error('Invalid time unit. Use m (minutes), h (hours), or d (days)');
  }
}

/**
 * Format duration in milliseconds to human-readable string
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(durationMs) {
  const minutes = Math.floor(durationMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else {
    return `${minutes}m`;
  }
} 