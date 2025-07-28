import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import featureManager from '../services/FeatureManager.js';
import { log } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const loadEvents = async (client) => {
  const eventFiles = fs.readdirSync(path.join(__dirname, '../events')).filter(file => file.endsWith('.js'));
  let loadedCount = 0;
  let skippedCount = 0;
  
  for (const file of eventFiles) {
    const event = await import(`../events/${file}`);
    const eventName = event.name;

    // Check if event is enabled in features config
    if (featureManager.isEventEnabled(eventName)) {
      if (event.once) {
        client.once(eventName, (...args) => event.execute(...args));
      } else {
        client.on(eventName, (...args) => event.execute(...args));
      }
      loadedCount++;
      log.debug(`Loaded event: ${eventName}`);
    } else {
      skippedCount++;
      log.debug(`Skipped disabled event: ${eventName}`);
    }
  }

  log.info(`Event loading complete`, {
    loaded: loadedCount,
    skipped: skippedCount,
    total: loadedCount + skippedCount
  });
};

export default loadEvents; 