import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'production';
const isDevelopment = NODE_ENV === 'development';

// Base config directory
const baseConfigDir = './src/config';
const testConfigDir = './src/config.test';

// Memoization cache
const configCache = new Map();

// Schemas
const activitySchema = z.object({
  name: z.string().min(1),
  type: z.number().optional(),
  duration_ms: z.number().optional()
}).passthrough();

const presenceSchema = z.object({
  status: z.string().optional(),
  rotate: z.boolean().optional(),
  rotate_ms: z.number().optional(),
  default: z.string().optional(),
  activities: z.array(activitySchema).optional()
}).passthrough().optional();

const botSchema = z.object({
  prefix: z.string().min(1),
  ownerID: z.string().min(1),
  botRole: z.string().min(1).optional(),
  presence: presenceSchema
}).passthrough();

const channelsSchema = z.object({
  welcomeChannelId: z.string().min(1),
  generalChannelId: z.string().min(1),
  modLogChannelId: z.string().min(1),
  botLogChannelId: z.string().min(1),
  levelCheckChannelId: z.string().min(1),
  statsChannelId: z.string().min(1),
  staffChannelId: z.string().min(1),
  rulesChannelId: z.string().min(1),
  joinToCreateChannelId: z.string().min(1),
  voiceCategoryId: z.string().min(1),
  botTestChannelId: z.string().min(1)
}).passthrough();

const rolesSchema = z.object({
  adminRoles: z.array(z.string().min(1)),
  modRoles: z.array(z.string().min(1)),
  memberRoles: z.array(z.string().min(1)),
  sayCommandRoles: z.array(z.string().min(1)),
  autoAssignRoles: z.array(z.string().min(1)),
  helperRole: z.string().min(1),
  cnsDeveloperRole: z.string().min(1),
  tagGuildId: z.string().min(1),
  cnsOfficialRole: z.string().min(1),
  cnsSpecialMemberRole: z.string().min(1),
  staffRole: z.string().min(1),
  levelRoles: z.record(z.string(), z.string().min(1)),
  commandPermissions: z.object({
    admin: z.array(z.string().min(1)),
    mod: z.array(z.string().min(1)),
    member: z.array(z.string().min(1))
  }),
  cnsRole: z.string().min(1),
  cnsNewcomerRole: z.string().min(1),
  birthdayRole: z.string().min(1)
}).passthrough();

const staffSchema = z.object({
  staffRoles: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    color: z.string().min(1),
    emoji: z.string().min(1)
  }))
}).passthrough();

const levelSettingsSchema = z.object({
  leveling: z.object({
    xpPerMessage: z.number(),
    xpPerMinuteVoice: z.number(),
    levelUpRoles: z.record(z.string(), z.string().min(1)),
    xpThresholds: z.record(z.string(), z.number()),
    roleAssignments: z.record(z.string(), z.string().min(1)),
    persistentRoles: z.record(z.string(), z.boolean())
  })
}).passthrough();

const commandCooldownsSchema = z.object({
  commands: z.record(z.string(), z.object({
    enabled: z.boolean(),
    description: z.string().optional()
  })),
  staffExemptions: z.object({
    enabled: z.boolean(),
    roles: z.array(z.string().min(1))
  })
}).passthrough();

const giveawaySchema = z.object({
  giveaway_channel_id: z.string().min(1),
  admin_role_ids: z.array(z.string().min(1)),
  cns_member_role_id: z.string().min(1),
  tag_eligibility: z.object({
    enabled: z.boolean(),
    cns_tag_role_id: z.string().min(1),
    min_role_age_days: z.number()
  }),
  weights: z.object({
    base: z.number(),
    booster_bonus: z.number(),
    max_total: z.number()
  })
}).passthrough();

const vcSettingsSchema = z.object({
  voiceChannelConfig: z.object({
    commandPermissions: z.object({
      createChannel: z.array(z.string()),
      deleteChannel: z.array(z.string()),
      moveChannel: z.array(z.string())
    }),
    channelCategory: z.string().min(1)
  })
}).passthrough();

const eventsSchema = z.object({
  eventChannel: z.string().min(1),
  teamSize: z.number()
}).passthrough();

const oauthSchema = z.object({
  redirectUri: z.string().min(1),
  scopes: z.array(z.string().min(1)),
  oauthUrl: z.string().min(1),
  strategy: z.enum(['bot', 'oauth']).optional()
}).passthrough();

const schemaMap = {
  bot: botSchema,
  channels: channelsSchema,
  roles: rolesSchema,
  staff: staffSchema,
  levelSettings: levelSettingsSchema,
  commandCooldowns: commandCooldownsSchema,
  giveaway: giveawaySchema,
  vcSettings: vcSettingsSchema,
  events: eventsSchema,
  oauth: oauthSchema
};

function readJson(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

function buildPath(configName) {
  return isDevelopment
    ? path.join(testConfigDir, `${configName}.json`)
    : path.join(baseConfigDir, `${configName}.json`);
}

function conciseZodError(error) {
  if (!error || !error.issues || error.issues.length === 0) return 'Unknown validation error';
  const first = error.issues[0];
  const pathStr = Array.isArray(first.path) ? first.path.join('.') : String(first.path);
  return `${first.message} at ${pathStr}`;
}

function loadAndValidate(configName) {
  const filePath = buildPath(configName);
  const schema = schemaMap[configName];
  const json = readJson(filePath);
  if (schema) {
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Invalid ${configName}.json: ${conciseZodError(parsed.error)}`);
    }
    return parsed.data;
  }
  return json;
}

function ensureConfigsLoaded() {
  const names = Object.keys(schemaMap);
  for (const name of names) {
    if (!configCache.has(name)) {
      const data = loadAndValidate(name);
      configCache.set(name, data);
    }
  }
}

ensureConfigsLoaded();

export function loadConfig(configName) {
  if (configCache.has(configName)) return configCache.get(configName);
  const data = loadAndValidate(configName);
  configCache.set(configName, data);
  return data;
}

/**
 * Get the current environment
 * @returns {string} 'development' or 'production'
 */
export function getEnvironment() {
  return NODE_ENV;
}

/**
 * Check if running in development mode
 * @returns {boolean}
 */
export function isDev() {
  return isDevelopment;
}

// Export commonly used configs
export const botConfig = () => loadConfig('bot');
export const channelsConfig = () => loadConfig('channels');
export const commandCooldownsConfig = () => loadConfig('commandCooldowns');
export const eventsConfig = () => loadConfig('events');
export const levelSettingsConfig = () => loadConfig('levelSettings');
export const oauthConfig = () => loadConfig('oauth');
export const rolesConfig = () => loadConfig('roles');
export const staffConfig = () => loadConfig('staff');
export const ticketsConfig = () => loadConfig('tickets');
export const vcSettingsConfig = () => loadConfig('vcSettings');
export const giveawayConfig = () => loadConfig('giveaway'); 