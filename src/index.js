// Create the initial folder structure and main bot file

// Import necessary modules
import { Client, GatewayIntentBits, Collection, Partials, ApplicationCommandOptionType } from 'discord.js';
import dotenv from 'dotenv';
import { updateStats } from './features/stats/statsUpdater.js';
import { updateStaffEmbed } from './features/staff/staffEmbed.js';
import { updateRulesEmbed } from './features/staff/rulesEmbed.js';
import { checkBirthdays } from './features/birthday/birthdayManager.js';
import { syncLevelRoles } from './features/leveling/levelRoleSync.js';
import { registerCommands } from './loaders/commandRegistrar.js';
import loadCommands from './loaders/commandLoader.js';
import loadEvents from './loaders/eventLoader.js';
import { setPresence } from './features/presence/presenceManager.js';
import { channelsConfig, getEnvironment, rolesConfig } from './config/configLoader.js';
import { syncUserTagRole } from './features/tagSync/tagSyncService.js';
import CleanupService from './features/system/cleanupService.js';
import logger from './utils/logger.js';
import { registerJob, startAll } from './scheduler/index.js';
import { tick as voiceTick } from './features/leveling/voiceSessionService.js';
import initPlayer from './music/initPlayer.js';
import { MusicRecommender } from './music/recommender.js';
import { loadState, saveState, saveQueue, loadQueue, saveResumeState, clearResumeState } from './music/queueStore.js';
import { buildNowPlaying, createButtonCollector } from './music/nowPlayingUi.js';
// Ensure database schema and migrations are applied on startup
import './database/db.js';
// Tag mirroring and legacy wiring removed

// Load environment variables (.env.dev when NODE_ENV=development; override with DOTENV_CONFIG_PATH)
const _envPath = process.env.DOTENV_CONFIG_PATH || (process.env.NODE_ENV === 'development' ? '.env.dev' : undefined);
if (_envPath) dotenv.config({ path: _envPath }); else dotenv.config();

// Initialize the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // REQUIRED for member updates!
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // REQUIRED for message content access
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User]
});

// Initialize music player
const player = initPlayer(client);
const recommender = new MusicRecommender(player);

// Store idle timers per guild
const idleTimers = new Map();

// Add global error handlers to prevent crashes
client.on('error', (error) => {
  logger.error({ err: error }, 'Client error');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught Exception');
});

// Add specific error handler for ticket-related operations
process.on('warning', (warning) => {
  logger.warn({ name: warning.name, message: warning.message }, 'Process warning');
});

// Initialize commands collection
client.commands = new Collection();

// Music player event handlers
player.events.on('playerStart', async (queue) => {
  try {
    const guild = queue.guild;
    const track = queue.currentTrack;
    
    logger.info(`Music started: ${track.title} in ${guild.name}`);
    
    // Load guild state
    const state = loadState(guild.id);
    
    // Save resume state
    saveResumeState(guild.id, track.url, 0, queue.connection?.joinConfig?.channelId, queue.metadata?.channel?.id);
    
    // Discord-player handles now playing display automatically
    
    // Clear idle timer
    if (idleTimers.has(guild.id)) {
      clearTimeout(idleTimers.get(guild.id));
      idleTimers.delete(guild.id);
    }
    
  } catch (error) {
    logger.error({ err: error }, 'Error in playerStart event');
  }
});

player.events.on('playerFinish', async (queue) => {
  try {
    const guild = queue.guild;
    const state = loadState(guild.id);
    
    // Clear resume state when track finishes
    clearResumeState(guild.id);
    
    // Handle autoplay
    if (state.autoplay && queue.tracks.size === 0) {
      const track = queue.currentTrack;
      if (track) {
        const success = await recommender.addRecommendationToQueue(guild.id, track);
        if (success) {
          logger.info(`Added autoplay recommendation to ${guild.name}`);
        }
      }
    }
    
  } catch (error) {
    logger.error({ err: error }, 'Error in playerFinish event');
  }
});

player.events.on('emptyQueue', async (queue) => {
  try {
    const guild = queue.guild;
    const state = loadState(guild.id);
    
    // Start idle timer
    const timeout = (state.idle_timeout_sec || 300) * 1000;
    const timer = setTimeout(async () => {
      try {
        if (queue.connection) {
          queue.disconnect();
          clearResumeState(guild.id);
          logger.info(`Disconnected from ${guild.name} due to idle timeout`);
        }
      } catch (error) {
        logger.error({ err: error }, 'Error during idle disconnect');
      }
    }, timeout);
    
    idleTimers.set(guild.id, timer);
    
  } catch (error) {
    logger.error({ err: error }, 'Error in emptyQueue event');
  }
});

player.events.on('error', (queue, error) => {
  logger.error({ err: error, guildId: queue.guild.id }, 'Music player error');
});

// Voice state update handler for idle management
client.on('voiceStateUpdate', (oldState, newState) => {
  try {
    const guild = oldState.guild;
    const node = player.nodes.get(guild.id);
    
    if (!node || !node.connection) return;
    
    // Check if bot is alone in voice channel
    const voiceChannel = node.connection.joinConfig?.channelId;
    if (!voiceChannel) return;
    
    const channel = guild.channels.cache.get(voiceChannel);
    if (!channel || !channel.members) return;
    
    const members = channel.members.filter(member => !member.user.bot);
    
    if (members.size === 0) {
      // Start idle timer
      const state = loadState(guild.id);
      const timeout = (state.idle_timeout_sec || 300) * 1000;
      
      if (idleTimers.has(guild.id)) {
        clearTimeout(idleTimers.get(guild.id));
      }
      
      const timer = setTimeout(async () => {
        try {
          if (node.connection) {
            node.disconnect();
            clearResumeState(guild.id);
            logger.info(`Disconnected from ${guild.name} due to no listeners`);
          }
        } catch (error) {
          logger.error({ err: error }, 'Error during no-listeners disconnect');
        }
      }, timeout);
      
      idleTimers.set(guild.id, timer);
    } else {
      // Clear idle timer if there are listeners
      if (idleTimers.has(guild.id)) {
        clearTimeout(idleTimers.get(guild.id));
        idleTimers.delete(guild.id);
      }
    }
    
  } catch (error) {
    logger.error({ err: error }, 'Error in voice state update handler');
  }
});

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

logger.debug('Importing scheduler jobs');

// Event listener for when the bot is ready
// Duplicate guildMemberUpdate handler removed; handled in events/guildMemberUpdate.js

// Duplicate raw GUILD_MEMBER_UPDATE handling removed; rely on dedicated event/service

client.once('ready', async () => {
  logger.info(`Logged in as ${client.user.tag}!`);
  logger.info(`Environment: ${getEnvironment()}`);
  setPresence(client);
  
  // Log all available guilds for debugging
  logger.debug('Available guilds:');
  client.guilds.cache.forEach(g => {
    logger.debug(`  - ${g.name} (${g.id})`);
  });
  
  const cfgGuildId = rolesConfig().mainGuildId || rolesConfig().main_guild_id || null;
  // Force use of config file guild ID, ignore environment variable
  const GUILD_ID = cfgGuildId;
  
  // Override any environment variable
  if (process.env.GUILD_ID && process.env.GUILD_ID !== GUILD_ID) {
    logger.warn(`Environment variable GUILD_ID (${process.env.GUILD_ID}) differs from config (${GUILD_ID}). Using config value.`);
    process.env.GUILD_ID = GUILD_ID;
  }
  logger.info({ GUILD_ID, cfgGuildId, envGuildId: process.env.GUILD_ID, source: cfgGuildId ? 'rolesConfig' : 'env' }, 'Selecting main guild');
  let guild = client.guilds.cache.get(GUILD_ID);
  // Attempt to fetch the configured guild if not in cache
  if (!guild && GUILD_ID) {
    try {
      guild = await client.guilds.fetch(GUILD_ID);
      logger.info(`Fetched configured guild: ${guild.name} (${guild.id})`);
    } catch (e) {
      logger.error({ err: e, GUILD_ID }, 'Failed to fetch configured guild');
    }
  }
  // If still not found, do not silently switch guilds; log and abort initialization-dependent steps
  if (!guild) {
    logger.error({ GUILD_ID }, 'Configured guild not found. Ensure the bot is in this guild and the ID is correct.');
    return;
  }
  
  if (guild) {
    logger.info(`Connected to guild: ${guild.name} (${guild.id})`);
    
    // Fetch roles and members to ensure we have complete caches
    try { await guild.roles.fetch(); } catch {}
    logger.debug('Fetching all guild members...');
    try {
      await guild.members.fetch();
      logger.info(`Fetched ${guild.members.cache.size} members`);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching members');
    }
    
    // Sync existing CNS tag holders on startup
    logger.info('Starting startup sync for existing CNS tag holders...');
    try {
      logger.trace('Importing syncExistingTagHoldersOnStartup...');
      const { syncExistingTagHoldersOnStartup } = await import('./features/tagSync/tagSyncService.js');
      logger.trace('Function imported successfully, calling it...');
      const startupSyncResult = await syncExistingTagHoldersOnStartup(guild, client);
      logger.trace({ startupSyncResult }, 'Startup sync completed');
      if (startupSyncResult.success) {
        logger.info(`Startup tag sync: ${startupSyncResult.message}`);
      } else {
        logger.warn(`Startup tag sync failed: ${startupSyncResult.error}`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Error during startup tag sync');
      logger.error(error.stack || '');
    }
    
    // backfill role tenure for existing cns tag holders
    try {
      const { giveawayConfig } = await import('./config/configLoader.js');
      const { recordRoleFirstSeen } = await import('./repositories/tagRepo.js');
      const tagRoleId = giveawayConfig().tag_eligibility?.cns_tag_role_id;
      if (tagRoleId) {
        const membersWithTag = guild.members.cache.filter(m => m.roles.cache.has(tagRoleId));
        for (const m of membersWithTag.values()) {
          // idempotent: only sets if missing
          recordRoleFirstSeen(guild.id, m.id, tagRoleId);
        }
        logger.info(`seeded role tenure for ${membersWithTag.size} tag holders`);
      }
    } catch (e) {
      logger.error({ err: e }, 'failed to seed role tenure');
    }
    
    // Auto-update the rules embed once on ready
    await updateRulesEmbed(client, guild.id);

    // Register scheduler jobs
    const guildId = guild.id;
    const statsChannelId = channelsConfig().statsChannelId;
    const staffChannelId = channelsConfig().staffChannelId;

    registerJob('stats.update', async () => {
      await updateStats(client, guildId, statsChannelId);
    }, 5 * 60 * 1000, { jitterMs: 30 * 1000, singleton: true });

    // Periodic tag sync removed (no mirroring). Manual via /tag-sync only.

    registerJob('levels.syncRoles', async () => {
      await syncLevelRoles(guild);
    }, 5 * 60 * 1000, { jitterMs: 60 * 1000, singleton: true });

    registerJob('staff.embed', async () => {
      await updateStaffEmbed(client, guildId, staffChannelId);
    }, 5 * 60 * 1000, { jitterMs: 30 * 1000, singleton: true });

    registerJob('rules.embed', async () => {
      await updateRulesEmbed(client, guildId);
    }, 5 * 60 * 1000, { jitterMs: 30 * 1000, singleton: true });

    registerJob('birthdays.check', async () => {
      await checkBirthdays(client);
    }, 60 * 60 * 1000, { jitterMs: 5 * 60 * 1000, singleton: true });

    registerJob('leveling.voiceTick', async () => {
      await voiceTick(client);
    }, 60 * 1000, { jitterMs: 10 * 1000, singleton: true });

    const { startAll } = await import('./scheduler/index.js');
    startAll();
    logger.info('Scheduler jobs registered and started');
    
    // Start the cleanup service
    logger.info('Starting cleanup service');
    const cleanupService = new CleanupService(client);
    cleanupService.start();
    logger.info('Cleanup service initialized');
    
    // Initial birthday check
    await checkBirthdays(client);
    
    // Initialize giveaway system
    logger.info('Initializing giveaway system');
    try {
      const { default: GiveawayService } = await import('./features/giveaway/service.js');
      const giveawayService = new GiveawayService();
      await giveawayService.restoreOpenGiveawaysOnStartup(client);
      logger.info('Giveaway system initialized');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize giveaway system');
    }

    // Resume music on startup
    logger.info('Checking for music to resume...');
    try {
      const { loadResumeState } = await import('./music/queueStore.js');
      const resumeState = loadResumeState(guild.id);
      
      if (resumeState && resumeState.voice_channel_id && resumeState.track_url) {
        const voiceChannel = guild.channels.cache.get(resumeState.voice_channel_id);
        if (voiceChannel && voiceChannel.isVoiceBased()) {
          const node = player.nodes.get(guild.id);
          if (!node) {
            player.nodes.create(guild.id, {
              metadata: {
                channel: guild.channels.cache.get(resumeState.text_channel_id),
                client: guild.members.me,
                requestedBy: guild.members.me
              },
              selfDeaf: false,
              volume: 80,
              leaveOnEnd: false,
              leaveOnStop: false,
              leaveOnEmpty: false
            });
          }
          
          await node.connect(voiceChannel);
          const searchResult = await player.search(resumeState.track_url, {
            requestedBy: guild.members.me
          });
          
          if (searchResult.hasTracks()) {
            node.queue.addTrack(searchResult.tracks[0]);
            await node.play();
            
            // Seek to saved position
            if (resumeState.track_position_ms > 0) {
              // Note: Seeking might not be available in all cases
              logger.info(`Resumed music at position ${resumeState.track_position_ms}ms`);
            }
            
            logger.info(`Resumed music in ${guild.name}: ${searchResult.tracks[0].title}`);
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to resume music');
    }
  } else {
    logger.error({ GUILD_ID }, 'Could not find guild with ID');
  }
  
  // Register commands dynamically based on roles
  await registerCommands(client);

  // /tag-sync command is provided by command loader; no manual registration needed here
});

// Minimal RAW listener: probe on user/guild member update packets with debounce
const __rawDebounce = new Map();
const __RAW_MIN_MS = Number(process.env.TAG_SYNC_MIN_INTERVAL_MS || 1500);
client.on('raw', async (pkt) => {
  try {
    const t = pkt?.t; if (!t) return;
    if (t !== 'GUILD_MEMBER_UPDATE' && t !== 'USER_UPDATE' && t !== 'PRESENCE_UPDATE') return;
    const userId = pkt?.d?.user?.id || pkt?.d?.user_id || pkt?.d?.id; if (!userId) return;
    const now = Date.now();
    const last = __rawDebounce.get(userId) || 0;
    if (now - last < __RAW_MIN_MS) return;
    __rawDebounce.set(userId, now);

    const MAIN_GUILD_ID = process.env.GUILD_ID || rolesConfig().mainGuildId || rolesConfig().main_guild_id;
    if (!MAIN_GUILD_ID) return;
    const guild = await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null);
    if (!guild) return;

    const res = await syncUserTagRole(userId, guild, client);
    logger.info({ userId, t, res }, '[TagWire] raw→syncUserTagRole');
  } catch (err) {
    logger.error({ err }, '[TagWire] raw handler failed');
  }
});

// Export the client for use in other modules
export default client;