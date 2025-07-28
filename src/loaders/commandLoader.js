import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import featureManager from '../services/FeatureManager.js';
import { log } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const loadCommands = async (client) => {
  const commandFolders = fs.readdirSync(path.join(__dirname, '../commands'));
  let loadedCount = 0;
  let skippedCount = 0;

  for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(path.join(__dirname, '../commands', folder)).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const command = await import(`../commands/${folder}/${file}`);
      const commandName = command.data.name;

      // Check if command is enabled in features config
      if (featureManager.isCommandEnabled(commandName)) {
        client.commands.set(commandName, command);
        loadedCount++;
        log.debug(`Loaded command: ${commandName}`);
      } else {
        skippedCount++;
        log.debug(`Skipped disabled command: ${commandName}`);
      }
    }
  }

  log.info(`Command loading complete`, {
    loaded: loadedCount,
    skipped: skippedCount,
    total: loadedCount + skippedCount
  });
};

export default loadCommands; 