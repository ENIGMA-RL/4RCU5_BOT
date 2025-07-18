// Create the initial folder structure and main bot file

// Import necessary modules
import { Client, GatewayIntentBits, EmbedBuilder, Collection } from 'discord.js';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { scheduleStatsUpdate, scheduleTagRoleSync } from './features/stats/statsUpdater.js';
import { scheduleStaffEmbedUpdate } from './features/staff/staffEmbed.js';
import { updateRulesEmbed } from './features/staff/rulesEmbed.js';
import { REST, Routes } from 'discord.js';
import { registerCommands } from './loaders/commandRegistrar.js';
import loadCommands from './loaders/commandLoader.js';
import loadEvents from './loaders/eventLoader.js';
import { setPresence } from './features/presence/presenceManager.js';
import { channelsConfig, getEnvironment, isDev } from './config/configLoader.js';

// Load environment variables
dotenv.config();

// Initialize the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // REQUIRED for member updates!
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
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
client.on('guildMemberUpdate', (oldMember, newMember) => {
  console.log('guildMemberUpdate event fired');
  if (oldMember.nickname !== newMember.nickname) {
    console.log(`${oldMember.user.tag} changed nickname from "${oldMember.nickname}" to "${newMember.nickname}"`);
  }
});

client.on('raw', async (packet) => {
  if (packet.t === 'GUILD_MEMBER_UPDATE') {
    const user = packet.d.user;
    const tagData = user?.primary_guild;
    const guildId = packet.d.guild_id;
    const userId = user.id;

    if (!tagData) return;

    const isUsingTag = tagData.identity_enabled && tagData.identity_guild_id === guildId;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.error('Guild not found in cache.');
      return;
    }

    // Try to fetch member if not cached
    let member = guild.members.cache.get(userId);
    if (!member) {
      try {
        member = await guild.members.fetch(userId);
      } catch (err) {
        console.error('Member not found in guild:', err);
        return;
      }
    }

    const roleId = '1389859132198096946'; // CNS Official role

    try {
      if (isUsingTag) {
        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId, 'User enabled server tag');
        }
      } else {
        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId, 'User disabled server tag');
        }
      }
    } catch (err) {
      console.error('Error updating CNS Official role:', err);
    }

    // Update stats after role change using the count of members with the CNS Official role
    const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(roleId)).size;
    if (typeof updateStats === 'function') {
      await updateStats(client, guild, membersWithRole);
    }
  }
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(`Environment: ${getEnvironment()}`);
  setPresence(client);
  const GUILD_ID = process.env.GUILD_ID;
  console.log('Using GUILD_ID from environment:', GUILD_ID);
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    console.log(`Connected to guild: ${guild.name} (${guild.id})`);
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
    scheduleStatsUpdate(client, guild.id, channelsConfig().statsChannelId);
    // Schedule the staff embed update
    scheduleStaffEmbedUpdate(client, guild.id, channelsConfig().staffChannelId);
    // Auto-update the rules embed
    await updateRulesEmbed(client, guild.id);
    // Schedule rules embed updates every 5 minutes
    setInterval(async () => {
      try {
        await updateRulesEmbed(client, guild.id);
      } catch (error) {
        console.error('Error updating rules embed:', error);
      }
    }, 5 * 60 * 1000);
    // Schedule the periodic tag role sync
    console.log('🔍 Calling scheduleTagRoleSync');
    scheduleTagRoleSync(client);
    console.log('📊 Stats, staff embed, and tag sync systems initialized');
  } else {
    console.error('❌ Could not find guild with ID:', GUILD_ID);
  }
  // Register commands dynamically based on roles
  await registerCommands(client);
});

// Export the client for use in other modules
export default client; 