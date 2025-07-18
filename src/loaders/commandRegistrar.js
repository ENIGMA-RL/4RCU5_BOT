import { REST, Routes } from 'discord.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Load all commands
async function loadAllCommands() {
  const commands = [];
  const commandFolders = fs.readdirSync('./src/commands');
  
  for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(`./src/commands/${folder}`).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const command = await import(`../commands/${folder}/${file}`);
      commands.push(command.data);
      console.log(`Loaded command: ${command.data.name}`);
    }
  }
  
  return commands;
}

export const registerCommands = async (client) => {
  console.log('Starting command registration (all commands visible for everyone)...');
  try {
    const allCommands = await loadAllCommands();
    console.log(`Loaded ${allCommands.length} total commands`);

    // Separate ping command for global registration
    const globalCommands = allCommands.filter(cmd => cmd.name === 'ping');
    const guildCommands = allCommands.filter(cmd => cmd.name !== 'ping');

    // Register global commands
    if (globalCommands.length > 0) {
      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: globalCommands }
      );
      console.log('Registered global commands: ping');
    }

    // Register all other commands per guild
    for (const guild of client.guilds.cache.values()) {
      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: guildCommands }
      );
      console.log(`Registered all commands for guild ${guild.name}`);
    }

    console.log('Command registration completed!');
  } catch (error) {
    console.error('Error in command registration:', error);
  }
}; 