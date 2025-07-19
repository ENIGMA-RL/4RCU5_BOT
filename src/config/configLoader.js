import fs from 'fs';
import path from 'path';

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'production';
const isDevelopment = NODE_ENV === 'development';

// Base config directory
const baseConfigDir = './src/config';
const testConfigDir = './src/config.test';

/**
 * Load configuration file based on environment
 * @param {string} configName - Name of the config file (without .json)
 * @returns {Object} Configuration object
 */
export function loadConfig(configName) {
  const configPath = isDevelopment 
    ? path.join(testConfigDir, `${configName}.json`)
    : path.join(baseConfigDir, `${configName}.json`);
  
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(`Error loading config ${configName}:`, error);
    throw error;
  }
}

/**
 * Get the current environment
 * @returns {string} 'development' or 'production'
 */
export function getEnvironment() {
  return NODE_ENV;
}

/**
 * Check if running in development mode
 * @returns {boolean}
 */
export function isDev() {
  return isDevelopment;
}

// Export commonly used configs
export const botConfig = () => loadConfig('bot');
export const channelsConfig = () => loadConfig('channels');
export const eventsConfig = () => loadConfig('events');
export const levelSettingsConfig = () => loadConfig('levelSettings');
export const oauthConfig = () => loadConfig('oauth');
export const rolesConfig = () => loadConfig('roles');
export const staffConfig = () => loadConfig('staff');
export const vcSettingsConfig = () => loadConfig('vcSettings'); 