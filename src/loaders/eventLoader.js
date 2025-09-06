import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const loadEvents = async (client) => {
  // Optionally keep these logs if you want to track event loading
  // console.log('📂 Loading events...');
  const eventFiles = fs.readdirSync(path.join(__dirname, '../events')).filter(file => file.endsWith('.js'));
  // console.log(`📁 Found ${eventFiles.length} event files: ${eventFiles.join(', ')}`);
  
  for (const file of eventFiles) {
    try {
      const event = await import(`../events/${file}`);
      if (!event?.name || typeof event.execute !== 'function') {
        logger.warn({ file }, 'Skipping invalid event file');
        continue;
      }
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
      logger.debug(`Loaded event: ${event.name}`);
    } catch (err) {
      logger.error({ err, file }, 'Failed to load event file; continuing');
    }
  }
  // console.log('🎉 Events loaded successfully!');
};

export default loadEvents; 