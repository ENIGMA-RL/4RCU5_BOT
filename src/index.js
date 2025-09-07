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
// removed redundant inline tag sync handlers in favor of event/service
import CleanupService from './features/system/cleanupService.js';
import logger from './utils/logger.js';
import { registerJob, startAll } from './scheduler/index.js';
import { tick as voiceTick } from './features/leveling/voiceSessionService.js';
// Ensure database schema and migrations are applied on startup
import './database/db.js';
import { registerTagSync } from './features/tag-sync/index.js';
import TagService from './services/tagService.js';
import { wireTagSync } from './features/tag/wireTagSync.js';

// Load environment variables
dotenv.config();

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
  const GUILD_ID = cfgGuildId || process.env.GUILD_ID;
  logger.info({ GUILD_ID, source: cfgGuildId ? 'rolesConfig' : 'env' }, 'Selecting main guild');
  let guild = client.guilds.cache.get(GUILD_ID);
  
  // If the specified guild is not found, use the first available guild
  if (!guild && client.guilds.cache.size > 0) {
    guild = client.guilds.cache.first();
    logger.warn(`Guild ${GUILD_ID} not found, using first available guild: ${guild.name} (${guild.id})`);
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

    registerJob('tag.sync', async () => {
      const { syncTagRolesToMainGuild } = await import('./services/tagService.js');
      await syncTagRolesToMainGuild(client);
    }, 5 * 60 * 1000, { jitterMs: 45 * 1000, singleton: true });

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
  } else {
    logger.error({ GUILD_ID }, 'Could not find guild with ID');
  }
  
  // Register commands dynamically based on roles
  await registerCommands(client);

  // Optionally enable the UserUpdate listener (default off to reduce noise during dev)
  try {
    if (process.env.ENABLE_USERUPDATE_TAG_SYNC === 'true') {
      const roleCfg = rolesConfig();
      const mainGuildId = roleCfg.mainGuildId || roleCfg.main_guild_id || null; // TARGET guild to grant/remove the role
      const identityGuildId = roleCfg.tagGuildId || roleCfg.tagSourceGuildId || mainGuildId;
      const tagRoleId = roleCfg.cnsOfficialRole || roleCfg.cns_official_role || null;
      if (identityGuildId && mainGuildId && tagRoleId) {
        registerTagSync(client, { identityGuildId, targetGuildId: mainGuildId, targetRoleId: tagRoleId });
        logger.info({ identityGuildId, mainGuildId, tagRoleId }, 'UserUpdate listener registered for tag sync');
      } else {
        logger.warn({ identityGuildId, mainGuildId, tagRoleId }, 'Skipping UserUpdate listener registration (missing IDs)');
      }
    } else {
      logger.info('UserUpdate listener disabled (ENABLE_USERUPDATE_TAG_SYNC!=true)');
    }
  } catch (e) {
    logger.error({ err: e }, 'Failed to register UserUpdate listener for tag sync');
  }

  // Optionally start TagService mirroring (default off without tagSourceRoleId)
  try {
    if (process.env.ENABLE_EVENT_TAG_MIRROR === 'true') {
      if (!client.__tagServiceStarted) {
        const tagSvc = new TagService(client);
        tagSvc.start();
        client.__tagServiceStarted = true;
        logger.info('TagService started');
      }
    } else {
      logger.info('TagService disabled (ENABLE_EVENT_TAG_MIRROR!=true)');
    }
  } catch (e) {
    logger.error({ err: e }, 'Failed to start TagService');
  }

  // Wire presence + /tag-sync passthrough to the unified syncUserTagRole
  try {
    wireTagSync(client);
    logger.info('Tag wire-up active');
  } catch (e) {
    logger.error({ err: e }, 'Failed to wire tag sync');
  }

  // Ensure /tag-sync is present as a guild command
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.commands.create({
      name: 'tag-sync',
      description: 'Sync CNS tag rol',
      options: [
        { name: 'user', description: 'User om te syncen', type: ApplicationCommandOptionType.User, required: false },
        { name: 'all', description: 'Bulk sync alle members', type: ApplicationCommandOptionType.Boolean, required: false }
      ]
    });
    logger.info('[TagWire] /tag-sync geregistreerd in guild');
  } catch (e) {
    logger.error({ err: e }, '[TagWire] kon /tag-sync niet registreren');
  }
});

// Export the client for use in other modules
export default client;