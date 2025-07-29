import fs from 'fs';
import path from 'path';

const COOLDOWN_STORAGE_FILE = './src/config/dynamicCooldowns.json';

/**
 * Load dynamic cooldown settings from file
 * @returns {Object} Dynamic cooldown settings
 */
function loadDynamicCooldowns() {
  try {
    if (fs.existsSync(COOLDOWN_STORAGE_FILE)) {
      const data = fs.readFileSync(COOLDOWN_STORAGE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading dynamic cooldowns:', error);
  }
  
  // Return default structure if file doesn't exist
  return {
    commands: {},
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Save dynamic cooldown settings to file
 * @param {Object} cooldowns - Cooldown settings to save
 */
function saveDynamicCooldowns(cooldowns) {
  try {
    // Ensure directory exists
    const dir = path.dirname(COOLDOWN_STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    cooldowns.lastUpdated = new Date().toISOString();
    fs.writeFileSync(COOLDOWN_STORAGE_FILE, JSON.stringify(cooldowns, null, 2));
  } catch (error) {
    console.error('Error saving dynamic cooldowns:', error);
  }
}

/**
 * Get cooldown duration for a command (prioritizes dynamic over config)
 * @param {string} commandName - Name of the command
 * @returns {number|null} Duration in minutes, or null if not set
 */
export function getCooldownDuration(commandName) {
  const dynamicCooldowns = loadDynamicCooldowns();
  
  if (dynamicCooldowns.commands[commandName]) {
    return dynamicCooldowns.commands[commandName].durationMinutes;
  }
  
  return null;
}

/**
 * Set cooldown duration for a command
 * @param {string} commandName - Name of the command
 * @param {number} durationMinutes - Duration in minutes
 * @param {string} setBy - User who set the cooldown
 */
export function setCooldownDuration(commandName, durationMinutes, setBy) {
  const dynamicCooldowns = loadDynamicCooldowns();
  
  dynamicCooldowns.commands[commandName] = {
    durationMinutes,
    enabled: true,
    setBy,
    setAt: new Date().toISOString()
  };
  
  saveDynamicCooldowns(dynamicCooldowns);
}

/**
 * Reset cooldown duration for a command (removes from dynamic storage)
 * @param {string} commandName - Name of the command
 */
export function resetCooldownDuration(commandName) {
  const dynamicCooldowns = loadDynamicCooldowns();
  
  if (dynamicCooldowns.commands[commandName]) {
    delete dynamicCooldowns.commands[commandName];
    saveDynamicCooldowns(dynamicCooldowns);
  }
}

/**
 * Get all dynamic cooldown settings
 * @returns {Object} All dynamic cooldown settings
 */
export function getAllDynamicCooldowns() {
  return loadDynamicCooldowns();
}

/**
 * Check if a command has dynamic cooldown settings
 * @param {string} commandName - Name of the command
 * @returns {boolean} True if command has dynamic settings
 */
export function hasDynamicCooldown(commandName) {
  const dynamicCooldowns = loadDynamicCooldowns();
  return !!dynamicCooldowns.commands[commandName];
} 