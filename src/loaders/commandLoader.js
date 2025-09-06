import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateSlashCommand } from '../utils/slashValidation.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const loadCommands = async (client) => {
  const baseDir = path.join(__dirname, '../commands');
  const commandFolders = fs.readdirSync(baseDir);
  for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(path.join(baseDir, folder)).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      try {
        const command = await import(`../commands/${folder}/${file}`);
        // Skip intentionally disabled or malformed commands
        if (!command?.data || typeof command.execute !== 'function') {
          logger.debug(`Skipping command file (no valid export): ${folder}/${file}`);
          continue;
        }
        try {
          validateSlashCommand(command);
        } catch (e) {
          logger.warn({ err: e, file: `${folder}/${file}` }, 'Command validation failed; skipping');
          continue;
        }
        client.commands.set(command.data.name, command);
        logger.debug(`Loaded command into client: ${command.data.name}`);
      } catch (err) {
        logger.error({ err, file: `${folder}/${file}` }, 'Failed to load command file; continuing');
      }
    }
  }
};

export default loadCommands; 