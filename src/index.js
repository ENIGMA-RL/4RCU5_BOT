// Create the initial folder structure and main bot file

// Import necessary modules
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import dotenv from 'dotenv';
import { scheduleStatsUpdate, scheduleTagRoleSync, updateStats } from './features/stats/statsUpdater.js';
import { scheduleStaffEmbedUpdate } from './features/staff/staffEmbed.js';
import { updateRulesEmbed } from './features/staff/rulesEmbed.js';
import { checkBirthdays } from './features/birthday/birthdayManager.js';
import { registerCommands } from './loaders/commandRegistrar.js';
import loadCommands from './loaders/commandLoader.js';
import loadEvents from './loaders/eventLoader.js';
import { setPresence } from './features/presence/presenceManager.js';
import { channelsConfig, getEnvironment, rolesConfig } from './config/configLoader.js';
import { logTagSync } from './utils/botLogger.js';
import { syncUserTagRole } from './features/tagSync/tagSyncService.js';
import { log } from './utils/logger.js';
import featureManager from './services/FeatureManager.js';

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

log.info('Bot starting up - importing scheduleStatsUpdate and scheduleTagRoleSync');

// Event listener for when the bot is ready
client.on('guildMemberUpdate', (oldMember, newMember) => {
  log.debug('guildMemberUpdate event fired');
  if (oldMember.nickname !== newMember.nickname) {
    log.info(`${oldMember.user.tag} changed nickname`, {
      userId: oldMember.id,
      oldNickname: oldMember.nickname,
      newNickname: newMember.nickname
    });
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
        log.error('Guild not found in cache');
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
      log.error('Error in raw event handler', error);
    }
});

client.once('ready', async () => {
  log.info(`Bot logged in as ${client.user.tag}`, {
    environment: getEnvironment(),
    guildCount: client.guilds.cache.size
  });
  
  setPresence(client);
  
  // Log all available guilds for debugging
  log.debug('Available guilds:', {
    guilds: Array.from(client.guilds.cache.values()).map(g => ({ id: g.id, name: g.name }))
  });
  
  const GUILD_ID = process.env.GUILD_ID;
  log.info('Using GUILD_ID from environment', { guildId: GUILD_ID });
  let guild = client.guilds.cache.get(GUILD_ID);
  
  // If the specified guild is not found, use the first available guild
  if (!guild && client.guilds.cache.size > 0) {
    guild = client.guilds.cache.first();
    log.warn(`Guild ${GUILD_ID} not found, using first available guild`, {
      expectedGuildId: GUILD_ID,
      fallbackGuildId: guild.id,
      fallbackGuildName: guild.name
    });
  }
  
  if (guild) {
    log.info(`Connected to guild`, {
      guildId: guild.id,
      guildName: guild.name
    });
    
    // Fetch all members to ensure we have complete member cache
    log.info('Fetching all guild members');
    try {
      await guild.members.fetch();
      log.info(`Fetched ${guild.members.cache.size} members`, {
        guildId: guild.id,
        memberCount: guild.members.cache.size
      });
    } catch (error) {
      log.error('Error fetching members', error, { guildId: guild.id });
    }
    // Log feature status for debugging
    featureManager.logFeatureStatus(guild);

    // Schedule the stats update with proper guild ID
    if (featureManager.isScheduledTaskEnabled('statsUpdate')) {
      log.info('Calling scheduleStatsUpdate');
      scheduleStatsUpdate(client, guild.id, channelsConfig().statsChannelId);
    }

    // Schedule the staff embed update
    if (featureManager.isScheduledTaskEnabled('staffEmbedUpdate')) {
      scheduleStaffEmbedUpdate(client, guild.id, channelsConfig().staffChannelId);
    }

    // Auto-update the rules embed
    if (featureManager.isFeatureEnabled('rules')) {
      await updateRulesEmbed(client, guild.id);
      // Schedule rules embed updates every 5 minutes
      setInterval(async () => {
        try {
          await updateRulesEmbed(client, guild.id);
        } catch (error) {
          log.error('Error updating rules embed', error, { guildId: guild.id });
        }
      }, 5 * 60 * 1000);
    }

    // Schedule the periodic tag role sync
    if (featureManager.isScheduledTaskEnabled('tagRoleSync')) {
      log.info('Calling scheduleTagRoleSync');
      scheduleTagRoleSync(client, guild.id);
    }

    log.info('Scheduled tasks initialized', { guildId: guild.id });
    
    // Schedule birthday checks every hour
    if (featureManager.isScheduledTaskEnabled('birthdayCheck')) {
      log.info('Starting birthday check scheduler');
      setInterval(async () => {
        try {
          await checkBirthdays(client);
        } catch (error) {
          log.error('Error in birthday check', error, { guildId: guild.id });
        }
      }, 60 * 60 * 1000); // Check every hour
      
      // Initial birthday check
      await checkBirthdays(client);
    }
  } else {
    log.error('Could not find guild with ID', { guildId: GUILD_ID });
  }
  // Register commands dynamically based on roles
  await registerCommands(client);
});

// Export the client for use in other modules
export default client;