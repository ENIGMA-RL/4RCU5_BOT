// Create the initial folder structure and main bot file

// Import necessary modules
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import dotenv from 'dotenv';
import { scheduleStatsUpdate, scheduleTagRoleSync, updateStats } from './features/stats/statsUpdater.js';
import { scheduleStaffEmbedUpdate } from './features/staff/staffEmbed.js';
import { updateRulesEmbed } from './features/staff/rulesEmbed.js';
import { checkBirthdays } from './features/birthday/birthdayManager.js';
import { scheduleLevelRoleSync } from './features/leveling/levelRoleSync.js';
import { registerCommands } from './loaders/commandRegistrar.js';
import loadCommands from './loaders/commandLoader.js';
import loadEvents from './loaders/eventLoader.js';
import { setPresence } from './features/presence/presenceManager.js';
import { channelsConfig, getEnvironment, rolesConfig } from './config/configLoader.js';
import { logTagSync } from './utils/botLogger.js';
import { syncUserTagRole } from './features/tagSync/tagSyncService.js';
import CleanupService from './features/system/cleanupService.js';

// Load environment variables
dotenv.config();

// Initialize the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // REQUIRED for member updates!
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // REQUIRED for message content access
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User]
});

// Add global error handlers to prevent crashes
client.on('error', (error) => {
  console.error('Client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process, just log the error
});

// Add specific error handler for ticket-related operations
process.on('warning', (warning) => {
  console.warn('Process warning:', warning.name, warning.message);
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
  try {
    if (packet.t === 'GUILD_MEMBER_UPDATE') {
      const user = packet.d.user;
      const tagData = user?.primary_guild;
      const guildId = packet.d.guild_id;
      const userId = user.id;

      if (!tagData) return;

      // Check if the tag is for the configured guild
      const tagGuildId = rolesConfig().tagGuildId;
      const isUsingTag = tagData.identity_enabled && tagData.identity_guild_id === tagGuildId;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.error('Guild not found in cache.');
        return;
      }

      // Use the service function for tag sync
      const result = await syncUserTagRole(userId, guild, client);
      
      if (result.success && result.action !== 'no_change') {
        // Update stats after role change
        if (typeof updateStats === 'function' && client.isReady()) {
          await updateStats(client, guild.id, channelsConfig().statsChannelId);
        }
      }
    }
  } catch (error) {
    console.error('Error in raw event handler:', error);
  }
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(`Environment: ${getEnvironment()}`);
  setPresence(client);
  
  // Log all available guilds for debugging
  console.log('Available guilds:');
  client.guilds.cache.forEach(g => {
    console.log(`  - ${g.name} (${g.id})`);
  });
  
  const GUILD_ID = process.env.GUILD_ID;
  console.log('Using GUILD_ID from environment:', GUILD_ID);
  let guild = client.guilds.cache.get(GUILD_ID);
  
  // If the specified guild is not found, use the first available guild
  if (!guild && client.guilds.cache.size > 0) {
    guild = client.guilds.cache.first();
    console.log(`⚠️  Guild ${GUILD_ID} not found, using first available guild: ${guild.name} (${guild.id})`);
  }
  
  if (guild) {
    console.log(`Connected to guild: ${guild.name} (${guild.id})`);
    
    // Fetch roles and members to ensure we have complete caches
    try { await guild.roles.fetch(); } catch {}
    console.log('🔄 Fetching all guild members...');
    try {
      await guild.members.fetch();
      console.log(`✅ Fetched ${guild.members.cache.size} members`);
    } catch (error) {
      console.error('❌ Error fetching members:', error);
    }
    
    // Sync existing CNS tag holders on startup
    console.log('🔄 Starting startup sync for existing CNS tag holders...');
    try {
      console.log('🔧 [DEBUG] Importing syncExistingTagHoldersOnStartup...');
      const { syncExistingTagHoldersOnStartup } = await import('./features/tagSync/tagSyncService.js');
      console.log('🔧 [DEBUG] Function imported successfully, calling it...');
      const startupSyncResult = await syncExistingTagHoldersOnStartup(guild, client);
      console.log('🔧 [DEBUG] Startup sync completed with result:', startupSyncResult);
      if (startupSyncResult.success) {
        console.log(`✅ Startup tag sync: ${startupSyncResult.message}`);
      } else {
        console.log(`⚠️ Startup tag sync failed: ${startupSyncResult.error}`);
      }
    } catch (error) {
      console.error('❌ Error during startup tag sync:', error);
      console.error('❌ Error stack:', error.stack);
    }
    
    // backfill role tenure for existing cns tag holders
    try {
      const { giveawayConfig } = await import('./config/configLoader.js');
      const { recordRoleFirstSeen } = await import('./database/db.js');
      const tagRoleId = giveawayConfig().tag_eligibility?.cns_tag_role_id;
      if (tagRoleId) {
        const membersWithTag = guild.members.cache.filter(m => m.roles.cache.has(tagRoleId));
        for (const m of membersWithTag.values()) {
          // idempotent: only sets if missing
          recordRoleFirstSeen(guild.id, m.id, tagRoleId);
        }
        console.log(`✅ seeded role tenure for ${membersWithTag.size} tag holders`);
      }
    } catch (e) {
      console.error('failed to seed role tenure:', e);
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
    scheduleTagRoleSync(client, guild.id);
    
    // Schedule the periodic level role sync
    console.log('🔍 Calling scheduleLevelRoleSync');
    scheduleLevelRoleSync(client, guild.id);
    console.log('📊 Stats, staff embed, tag sync, and level role sync systems initialized');
    
    // Start the cleanup service
    console.log('🧹 Starting cleanup service');
    const cleanupService = new CleanupService(client);
    cleanupService.start();
    console.log('✅ Cleanup service initialized');
    
    // Schedule birthday checks every hour
    console.log('🎂 Starting birthday check scheduler');
    setInterval(async () => {
      try {
        await checkBirthdays(client);
      } catch (error) {
        console.error('Error in birthday check:', error);
      }
    }, 60 * 60 * 1000); // Check every hour
    
    // Initial birthday check
    await checkBirthdays(client);
    
    // Initialize giveaway system
    console.log('🎁 Initializing giveaway system');
    try {
      const { default: GiveawayService } = await import('./features/giveaway/service.js');
      const giveawayService = new GiveawayService();
      await giveawayService.restoreOpenGiveawaysOnStartup(client);
      console.log('✅ Giveaway system initialized');
    } catch (error) {
      console.error('❌ Failed to initialize giveaway system:', error);
    }
  } else {
    console.error('❌ Could not find guild with ID:', GUILD_ID);
  }
  
  // Register commands dynamically based on roles
  await registerCommands(client);
});

// Export the client for use in other modules
export default client;