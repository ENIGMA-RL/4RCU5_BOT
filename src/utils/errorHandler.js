import { log } from './logger.js';

/**
 * Standardized error handler for Discord interactions
 * @param {import('discord.js').Interaction} interaction - The Discord interaction
 * @param {Error} error - The error that occurred
 * @param {Object} context - Additional context for logging
 */
export const handleInteractionError = async (interaction, error, context = {}) => {
  const commandName = interaction.commandName || 'unknown';
  const userId = interaction.user?.id || 'unknown';
  const guildId = interaction.guild?.id || 'unknown';
  
  // Log the error with context
  log.error(`Command execution failed: ${commandName}`, error, {
    command: commandName,
    userId,
    guildId,
    channelId: interaction.channelId,
    ...context
  });

  // Determine error message based on error type
  let userMessage = '❌ An error occurred while executing this command.';
  
  if (error.code === 50013) {
    userMessage = '❌ I don\'t have the required permissions to perform this action.';
  } else if (error.code === 10008) {
    userMessage = '❌ The requested resource was not found.';
  } else if (error.code === 50001) {
    userMessage = '❌ I cannot access the required channel.';
  }

  // Send error response to user
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ 
        content: userMessage, 
        flags: 64 
      });
    } else {
      await interaction.reply({ 
        content: userMessage, 
        flags: 64 
      });
    }
  } catch (replyError) {
    log.error('Failed to send error reply to user', replyError, {
      originalError: error.message,
      command: commandName,
      userId
    });
  }
};

/**
 * Standardized error handler for general async operations
 * @param {Error} error - The error that occurred
 * @param {string} operation - Description of the operation that failed
 * @param {Object} context - Additional context for logging
 */
export const handleGeneralError = (error, operation, context = {}) => {
  log.error(`Operation failed: ${operation}`, error, context);
};

/**
 * Wrapper for async functions with automatic error handling
 * @param {Function} fn - The async function to wrap
 * @param {string} operationName - Name of the operation for logging
 * @param {Function} errorHandler - Custom error handler (optional)
 */
export const withErrorHandling = (fn, operationName, errorHandler = null) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (errorHandler) {
        await errorHandler(error, operationName);
      } else {
        handleGeneralError(error, operationName);
      }
      throw error; // Re-throw to allow calling code to handle if needed
    }
  };
};

/**
 * Check if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} Whether the error is retryable
 */
export const isRetryableError = (error) => {
  const retryableCodes = [429, 500, 502, 503, 504];
  return retryableCodes.includes(error.code) || 
         retryableCodes.includes(error.status) ||
         error.message?.includes('rate limit') ||
         error.message?.includes('server error');
}; 