import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

export const logToChannel = async (channel, message) => {
  if (channel) {
    await channel.send(message);
  }
  logger.info(message);
};

export default logger; 