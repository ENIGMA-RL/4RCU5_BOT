import pino from 'pino';

const isDevelopment = (process.env.NODE_ENV || 'production') === 'development';
const level = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

let transportConfig = undefined;
if (isDevelopment) {
  try {
    // Probe availability of pino-pretty at runtime; if missing, fall back silently
    await import('pino-pretty');
    transportConfig = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' }
    };
  } catch {
    // pretty not installed; continue without transport
  }
}

const options = { level };
if (transportConfig) {
  options.transport = transportConfig;
}

const logger = pino(options);

export default logger;