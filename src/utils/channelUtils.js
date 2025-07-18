import { channelsConfig } from '../config/configLoader.js';

/**
 * Check if a channel is the bot test channel
 * @param {string} channelId - The channel ID to check
 * @returns {boolean} - True if it's the bot test channel
 */
export function isBotTestChannel(channelId) {
  try {
    const config = channelsConfig();
    return channelId === config.botTestChannelId;
  } catch (error) {
    console.error('Error checking bot test channel:', error);
    return false;
  }
}

/**
 * Check if a command should bypass channel restrictions
 * @param {string} channelId - The channel ID where the command is being executed
 * @returns {boolean} - True if restrictions should be bypassed
 */
export function shouldBypassChannelRestrictions(channelId) {
  return isBotTestChannel(channelId);
} 