import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const loadCommands = async (client) => {
  const commandFolders = fs.readdirSync(path.join(__dirname, '../commands'));
  for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(path.join(__dirname, '../commands', folder)).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const command = await import(`../commands/${folder}/${file}`);
      client.commands.set(command.data.name, command);
    }
  }
};

export default loadCommands; 