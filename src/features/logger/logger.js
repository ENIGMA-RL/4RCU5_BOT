import pino from 'pino';

const logger = pino({
  level: 'info'
});

export const logAction = (action) => {
  logger.info(action);
};

export default logger; 