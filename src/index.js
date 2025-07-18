// Create the initial folder structure and main bot file

// Import necessary modules
import { Client, GatewayIntentBits, EmbedBuilder, Collection } from 'discord.js';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { scheduleStatsUpdate, scheduleTagRoleSync } from './features/stats/statsUpdater.js';
import { scheduleStaffEmbedUpdate } from './features/staff/staffEmbed.js';
import { updateRulesEmbed } from './features/staff/rulesEmbed.js';
import { REST, Routes } from 'discord.js';
import fs from 'fs';
import { registerCommands } from './loaders/commandRegistrar.js';
import loadCommands from './loaders/commandLoader.js';
import loadEvents from './loaders/eventLoader.js';
import { setPresence } from './features/presence/presenceManager.js';
// Load channels config
const channelsConfig = JSON.parse(fs.readFileSync('./src/config/channels.json', 'utf8'));

// Load environment variables
dotenv.config();

// Initialize the Discord client
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ] 
});

// Initialize commands collection
client.commands = new Collection();

// Main initialization function
const initializeBot = async () => {
  // Load commands and events
  await loadCommands(client);
  await loadEvents(client);

  // Log in to Discord
  client.login(process.env.DISCORD_TOKEN);
};

// Start the bot
initializeBot();

console.log('🔍 Importing scheduleStatsUpdate and scheduleTagRoleSync');

// Event listener for when the bot is ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  setPresence(client);
  console.log('🔍 Executing scheduleStatsUpdate and scheduleTagRoleSync');
  
  // Get the first guild (assuming single guild bot)
  const guild = client.guilds.cache.first();
  if (guild) {
    console.log(`Connected to guild: ${guild.name}`);
    
    // Fetch all members to ensure we have complete member cache
    console.log('🔄 Fetching all guild members...');
    try {
      await guild.members.fetch();
      console.log(`✅ Fetched ${guild.members.cache.size} members`);
    } catch (error) {
      console.error('❌ Error fetching members:', error);
    }
    
    // Schedule the stats update with proper guild ID
    console.log('🔍 Calling scheduleStatsUpdate');
    scheduleStatsUpdate(client, guild.id, channelsConfig.statsChannelId);
    
    // Schedule the staff embed update
    scheduleStaffEmbedUpdate(client, guild.id, channelsConfig.staffChannelId);

    // Auto-update the rules embed
    await updateRulesEmbed(client, guild.id);
    
    // Schedule the periodic tag role sync
    console.log('🔍 Calling scheduleTagRoleSync');
    scheduleTagRoleSync(client);
    
    console.log('📊 Stats, staff embed, and tag sync systems initialized');
  }
  
  // Register commands dynamically based on roles
  await registerCommands(client);
});

// Export the client for use in other modules
export default client; 