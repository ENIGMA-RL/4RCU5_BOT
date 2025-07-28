import pino from 'pino';

// Create logger instance with environment-based configuration
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined
});

// Centralized logging interface
export const log = {
  info: (message, context = {}) => {
    logger.info({ ...context }, message);
  },
  
  error: (message, error = null, context = {}) => {
    if (error) {
      logger.error({ 
        ...context, 
        error: error.message, 
        stack: error.stack 
      }, message);
    } else {
      logger.error({ ...context }, message);
    }
  },
  
  warn: (message, context = {}) => {
    logger.warn({ ...context }, message);
  },
  
  debug: (message, context = {}) => {
    logger.debug({ ...context }, message);
  }
};

// Legacy function for backward compatibility
export const logToChannel = async (channel, message) => {
  if (channel) {
    await channel.send(message);
  }
  log.info(message);
};

export default logger; 