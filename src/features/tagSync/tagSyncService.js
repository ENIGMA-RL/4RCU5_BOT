import fetch from 'node-fetch';
import { fetchWithBackoff } from '../../utils/fetchWithBackoff.js';
import { rolesConfig, channelsConfig, isDev, oauthConfig } from '../../config/configLoader.js';
import { EmbedBuilder } from 'discord.js';
import { logTagSync } from '../../utils/botLogger.js';
import { setCnsTagEquippedWithGuild, setCnsTagUnequippedWithGuild, isCnsTagCurrentlyEquipped, syncExistingTagHolders } from '../../repositories/tagRepo.js';
import logger from '../../utils/logger.js';
import { botTokenHasTag, oauthHasTag } from './strategy.js';
import { fetchRoleHolders } from '../../utils/discordHelpers.js';

// Global backoff and simple cache to reduce rate limit hits
let globalRateLimitedUntil = 0;
// Default: no cache; respect 0 via nullish coalescing
export const TAG_STATUS_TTL_MS = Number(process.env.TAG_STATUS_TTL_MS ?? 0);
const tagStatusCache = new Map(); // userId -> { at: number, result }

export function clearTagStatusCache(userId) {
  if (userId) tagStatusCache.delete(userId); else tagStatusCache.clear();
}

export function isGloballyRateLimited() {
  return Date.now() < globalRateLimitedUntil;
}

export function getGlobalRateLimitReset() {
  return globalRateLimitedUntil;
}

function setGlobalRateLimitFromHeaders(response) {
  const retryAfter = Number(response.headers.get('retry-after') || 1);
  globalRateLimitedUntil = Date.now() + (retryAfter * 1000);
  return retryAfter;
}


/**
 * Check if user has server tag enabled using bot token
 * @param {string} userId - The user ID to check
 * @param {Client} client - The Discord client
 * @returns {Promise<{userId: string, isUsingTag: boolean, tagData: any, userData: any}>}
 */
export async function checkUserTagStatus(userId, client, opts = {}) {
  try {
    if (isGloballyRateLimited()) {
      throw new Error('Rate limited: global backoff active');
    }
    const forceRefresh = !!opts.forceRefresh;
    const noCache = !!opts.noCache;
    if (!forceRefresh && !noCache) {
      const cached = tagStatusCache.get(userId);
      if (TAG_STATUS_TTL_MS > 0 && cached && (Date.now() - cached.at) < TAG_STATUS_TTL_MS) {
        // logger.debug({ userId }, '[TagSync] cache hit');
        return cached.result;
      }
    }
    const useOauth = opts.strategy === 'oauth' && opts.accessToken;
    const fetchRes = useOauth
      ? await oauthHasTag({ accessToken: opts.accessToken })
      : await botTokenHasTag({ userId, client });

    if (!fetchRes.ok) {
      throw new Error('Failed to fetch user tag status');
    }
    const { userData, tagData, isUsingTag } = fetchRes;
    
    // Debug logging
    if (isDev()) {
      logger.trace({
        userId,
        hasPrimaryGuild: !!tagData,
        primaryGuild: tagData,
        identityEnabled: tagData?.identity_enabled,
        identityGuildId: tagData?.identity_guild_id,
        expectedGuildId: rolesConfig().tagGuildId
      }, '[TagSync Debug] User data');
    }
    
    // Check if user has tag enabled for our main guild
    const expectedGuildId = process.env.GUILD_ID || rolesConfig().tagGuildId;
    const hasTag = Boolean(tagData && tagData.identity_enabled && tagData.identity_guild_id === expectedGuildId);

    if (isDev()) {
      logger.trace(`[TagSync Debug] User ${userId} hasTag: ${hasTag}`);
    }

    const out = {
      userId,
      isUsingTag: hasTag,
      tagData,
      userData
    };
    if (!noCache && TAG_STATUS_TTL_MS > 0) tagStatusCache.set(userId, { at: Date.now(), result: out });
    return out;
  } catch (error) {
    logger.error({ err: error }, `Error checking tag status for user ${userId}`);
    throw error;
  }
}

/**
 * Sync user's tag role based on their tag status
 * @param {string} userId - The user ID to sync
 * @param {Guild} guild - The guild to sync roles in
 * @param {Client} client - The Discord client
 * @returns {Promise<{success: boolean, action?: string, user?: string, reason?: string, error?: string}>}
 */
export async function syncUserTagRole(userId, guild, client, opts = {}) {
  try {
    if (isGloballyRateLimited()) {
      return { success: false, error: 'rate_limited' };
    }
    
    // Skip tag sync in development mode unless override is enabled
    if (isDev() && process.env.ALLOW_DEV_TAG_WRITES !== 'true') {
      logger.debug(`[TagSync] Skipping tag sync for user ${userId} in development mode (set ALLOW_DEV_TAG_WRITES=true to enable)`);
      return { success: true, action: 'skipped', user: 'Development Mode', reason: 'Tag sync disabled in development' };
    }
    
    // Choose strategy: default bot-token; opt-in oauth via config
    const strategy = (oauthConfig().strategy || 'bot');
    const tagStatus = await checkUserTagStatus(
      userId,
      client,
      strategy === 'oauth'
        ? { strategy: 'oauth', accessToken: null, forceRefresh: !!opts.forceRefresh }
        : { forceRefresh: !!opts.forceRefresh }
    );
    
    // Get the member object
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return { success: false, error: 'Member not found' };
    }

    const cnsOfficialRoleId = rolesConfig().cnsOfficialRole;
    const hasRole = member.roles.cache.has(cnsOfficialRoleId);

    if (tagStatus.isUsingTag) {
      // User has tag enabled - add role if they don't have it
      if (!hasRole) {
        await member.roles.add(cnsOfficialRoleId, 'Server tag enabled');
        
        // Track tag equipment in database
        logger.trace(`About to call setCnsTagEquippedWithGuild for user ${userId} in guild ${guild.id}`);
        setCnsTagEquippedWithGuild(userId, guild.id);
        logger.trace(`Called setCnsTagEquippedWithGuild for user ${userId}`);
        
        // Log the role assignment
        const role = guild.roles.cache.get(cnsOfficialRoleId);
        if (role) {
          await logTagSync(guild.client, member.id, member.user.tag, 'Added', 'Server tag enabled');
        }
        
        // keep cache truthful
        tagStatusCache.set(userId, { at: Date.now(), result: { userId, isUsingTag: true, tagData: tagStatus.tagData, userData: tagStatus.userData } });
        return { 
          success: true, 
          action: 'added', 
          user: member.user.tag,
          reason: 'Server tag enabled'
        };
      } else {
        return { 
          success: true, 
          action: 'no_change', 
          user: member.user.tag,
          reason: 'Role already assigned'
        };
      }
    } else {
      // User has tag disabled - remove role if they have it
      if (hasRole) {
        await member.roles.remove(cnsOfficialRoleId, 'Server tag disabled');
        
        // Track tag unequipment in database
        logger.trace(`About to call setCnsTagUnequippedWithGuild for user ${userId} in guild ${guild.id}`);
        setCnsTagUnequippedWithGuild(userId, guild.id);
        logger.trace(`Called setCnsTagUnequippedWithGuild for user ${userId}`);
        
        // Log the role removal
        const role = guild.roles.cache.get(cnsOfficialRoleId);
        if (role) {
          await logTagSync(guild.client, member.id, member.user.tag, 'Removed', 'Server tag disabled');
        }
        
        tagStatusCache.set(userId, { at: Date.now(), result: { userId, isUsingTag: false, tagData: tagStatus.tagData, userData: tagStatus.userData } });
        return { 
          success: true, 
          action: 'removed', 
          user: member.user.tag,
          reason: 'Server tag disabled'
        };
      } else {
        return { 
          success: true, 
          action: 'no_change', 
          user: member.user.tag,
          reason: 'Role not assigned'
        };
      }
    }
  } catch (error) {
    logger.error({ err: error }, `Error syncing tag role for user ${userId}`);
    return { 
      success: false, 
      error: error.message,
      userId 
    };
  }
}

/**
 * Sync all users' tag roles using bot token approach
 * @param {Guild} guild - The guild to sync roles in
 * @param {Client} client - The Discord client
 * @returns {Promise<{success: boolean, processed?: number, successCount?: number, errorCount?: number, results?: any[]}>}
 */
export async function syncAllUserTags(guild, client) {
  try {
    // Skip tag sync in development mode unless override is enabled
    if (isDev() && process.env.ALLOW_DEV_TAG_WRITES !== 'true') {
      logger.debug('[TagSync] Skipping bulk tag sync in development mode (set ALLOW_DEV_TAG_WRITES=true to enable)');
      return { success: true, processed: 0, successCount: 0, errorCount: 0, results: [], message: 'Tag sync disabled in development mode' };
    }
    if (isGloballyRateLimited()) {
      return { success: false, error: 'rate_limited' };
    }
    
    // Fetch all members in the guild
    const members = await guild.members.fetch();
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Process users in batches to avoid rate limits
    const batchSize = 2; // Lower batch size for less rate limiting
    const memberArray = Array.from(members.values());
    
    for (let i = 0; i < memberArray.length; i += batchSize) {
      const batch = memberArray.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (member) => {
        try {
          const result = await syncUserTagRole(member.id, guild, client);
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
          return result;
        } catch (error) {
          // Handle 429 errors
          if (error.response && error.response.status === 429) {
            const retryAfter = error.response.headers['retry-after'] || 1;
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          }
          
          // Handle server errors (5xx)
          if (error.message && error.message.includes('Server error: 5')) {
            logger.warn(`Server error when processing user ${member.id}. Will retry in next batch.`);
            // Don't increment error count for server errors as they will be retried
            return { 
              success: false, 
              error: error.message,
              userId: member.id,
              retryable: true
            };
          }
          
          errorCount++;
          logger.error({ err: error }, `Error processing user ${member.id}`);
          return { 
            success: false, 
            error: error.message,
            userId: member.id 
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Add short delay between batches to respect rate limits
      if (i + batchSize < memberArray.length) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 seconds
      }
    }

    return {
      success: true,
      processed: memberArray.length,
      successCount,
      errorCount,
      results
    };
  } catch (error) {
    logger.error({ err: error }, 'Error in bulk tag sync');
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Sync tag roles based on tags from the tag guild using bot token approach
 * @param {Guild} mainGuild - The guild to sync roles in
 * @param {Client} client - The Discord client
 * @returns {Promise<{count: number, updated: number, removed: number}>}
 */
export async function syncTagRolesFromGuild(mainGuild, client) {
  // Skip tag sync in development mode unless override is enabled
  if (isDev() && process.env.ALLOW_DEV_TAG_WRITES !== 'true') {
    logger.debug('[TagSync] Skipping tag guild sync in development mode (set ALLOW_DEV_TAG_WRITES=true to enable)');
    return { count: 0, updated: 0, removed: 0 };
  }
  if (isGloballyRateLimited()) {
    return { count: 0, updated: 0, removed: 0 };
  }
  
  const tagGuildId = rolesConfig().tagGuildId;
  const tagRoleId = rolesConfig().cnsOfficialRole;
  const statsChannelId = channelsConfig().statsChannelId;
  const MAX_PER_RUN = Number(process.env.TAG_SYNC_MAX_PER_RUN || 50);

  // Fetch all members in the main guild
  const mainGuildMembers = await mainGuild.members.fetch();
  let count = 0;
  let updated = 0;
  let removed = 0;
  let processed = 0;

  for (const member of mainGuildMembers.values()) {
    try {
      // Fetch user data from Discord API to check their primary guild
      const userResponse = await fetchWithBackoff(
        `https://discord.com/api/users/${member.user.id}`,
        { headers: { Authorization: `Bot ${client.token}` } },
        { name: 'discord:getUser' }
      );

      if (userResponse.status === 429) {
        const retryAfter = setGlobalRateLimitFromHeaders(userResponse);
        logger.warn(`Rate limited. Next sync attempt after ${retryAfter} seconds.`);
        return { count, updated, removed };
      }

      // Handle server errors (5xx) with retry logic
      if (userResponse.status >= 500 && userResponse.status < 600) {
        logger.warn(`Server error (${userResponse.status}) for ${member.user.tag}. Retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      if (!userResponse.ok) {
        logger.warn(`Could not fetch user data for ${member.user.tag}: ${userResponse.status}`);
        continue;
      }

      const userData = await userResponse.json();
      const tagData = userData.primary_guild;
      
      // Check if user has tag enabled for the configured guild
      const hasTag = tagData && 
                    tagData.identity_enabled && 
                    tagData.identity_guild_id === tagGuildId;

      const hasRole = member.roles.cache.has(tagRoleId);
      
      if (hasTag) count++;
      
      if (hasTag && !hasRole) {
        await member.roles.add(tagRoleId, 'Has CNS tag enabled for tag guild');
        updated++;
        setCnsTagEquippedWithGuild(member.id, mainGuild.id);
        await logTagSync(client, member.id, member.user.tag, 'Added', 'Bulk sync - Has CNS tag enabled');
      } else if (!hasTag && hasRole) {
        await member.roles.remove(tagRoleId, 'No CNS tag enabled for tag guild');
        removed++;
        setCnsTagUnequippedWithGuild(member.id, mainGuild.id);
        await logTagSync(client, member.id, member.user.tag, 'Removed', 'Bulk sync - No CNS tag enabled');
      }
    } catch (error) {
      logger.error({ err: error }, `Error processing member ${member.user.tag}`);
    }
    // Add short delay between each user to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 seconds
    processed++;
    if (processed >= MAX_PER_RUN) {
      break;
    }
  }

  // Update the existing stats embed with the new tag count
  const statsChannel = await mainGuild.channels.fetch(statsChannelId).catch(() => null);
  if (statsChannel && statsChannel.isTextBased()) {
    try {
      const messages = await statsChannel.messages.fetch({ limit: 50 });
      const statsMessage = messages.find(msg =>
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title === 'Server Statistics'
      );
      
      if (statsMessage) {
        const embed = EmbedBuilder.from(statsMessage.embeds[0]);
        const fields = embed.data.fields.map(field =>
          field.name.includes('CNS Tags') || field.name.includes('💜 CNS Tags')
            ? { ...field, value: `\`${count}\`` }
            : field
        );
        embed.setFields(fields);
        await statsMessage.edit({ embeds: [embed] });
      }
    } catch (error) {
      logger.error({ err: error }, 'Error updating stats embed');
    }
  }

  return { count, updated, removed };
}

// Mirror tags based on a source guild role → destination CNS role (robust fallback)
export async function mirrorFromSourceRole(client) {
  const roles = rolesConfig();
  const SRC_GUILD_ID = roles.tagSourceGuildId ?? roles.tagGuildId;
  const SRC_ROLE_ID  = roles.tagSourceRoleId ?? roles.cnsOfficialRole;
  const DST_GUILD_ID = process.env.GUILD_ID;
  const DST_ROLE_ID  = roles.cnsOfficialRole;

  const srcGuild = await client.guilds.fetch(SRC_GUILD_ID).catch(() => null);
  const dstGuild = await client.guilds.fetch(DST_GUILD_ID).catch(() => null);
  if (!srcGuild || !dstGuild) return { count: 0, updated: 0, removed: 0 };

  const srcHolders = await fetchRoleHolders(srcGuild, SRC_ROLE_ID);
  const dstMembers = await dstGuild.members.fetch();
  const srcIds = new Set([...srcHolders.keys()]);

  let added = 0, removed = 0;
  for (const [, m] of dstMembers) {
    const shouldHave = srcIds.has(m.id);
    const hasDst = m.roles.cache.has(DST_ROLE_ID);
    if (shouldHave && !hasDst) { try { await m.roles.add(DST_ROLE_ID, 'mirror tag from source guild'); added++; } catch {} }
  }
  for (const [, m] of dstMembers) {
    const shouldHave = srcIds.has(m.id);
    const hasDst = m.roles.cache.has(DST_ROLE_ID);
    if (hasDst && !shouldHave) { try { await m.roles.remove(DST_ROLE_ID, 'mirror tag removed in source guild'); removed++; } catch {} }
  }
  return { count: srcIds.size, updated: added, removed };
}

// Mirror for a single user id from source guild role → destination official role
export async function mirrorUserFromSourceRole(client, userId) {
  const roles = rolesConfig();
  const SRC_GUILD_ID = roles.tagSourceGuildId ?? roles.tagGuildId;
  const SRC_ROLE_ID  = roles.tagSourceRoleId ?? roles.cnsOfficialRole;
  const DST_GUILD_ID = process.env.GUILD_ID;
  const DST_ROLE_ID  = roles.cnsOfficialRole;

  const srcGuild = await client.guilds.fetch(SRC_GUILD_ID).catch(() => null);
  const dstGuild = await client.guilds.fetch(DST_GUILD_ID).catch(() => null);
  if (!srcGuild || !dstGuild) return { added: 0, removed: 0 };

  try { await srcGuild.members.fetch({ user: userId }); } catch {}
  try { await dstGuild.members.fetch({ user: userId }); } catch {}

  const srcMember = srcGuild.members.cache.get(userId);
  const dstMember = dstGuild.members.cache.get(userId);
  if (!dstMember) return { added: 0, removed: 0 };

  const shouldHave = !!srcMember?.roles.cache.has(SRC_ROLE_ID);
  const hasDst = dstMember.roles.cache.has(DST_ROLE_ID);

  if (shouldHave && !hasDst) { try { await dstMember.roles.add(DST_ROLE_ID, 'mirror tag from source guild'); } catch {} return { added: 1, removed: 0 }; }
  if (!shouldHave && hasDst) { try { await dstMember.roles.remove(DST_ROLE_ID, 'mirror tag removed in source guild'); } catch {} return { added: 0, removed: 1 }; }
  return { added: 0, removed: 0 };
}

/**
 * Sync existing tag holders on bot startup
 * This ensures users who already have the CNS tag get timestamps recorded
 * @param {Guild} guild - The guild to sync
 * @param {Client} client - The Discord client
 * @returns {Promise<{success: boolean, synced: number, total: number}>}
 */
export async function syncExistingTagHoldersOnStartup(guild, client) {
  try {
    logger.info('Starting startup sync for existing CNS tag holders...');
    
    // Skip in development mode unless override is enabled
    if (isDev() && process.env.ALLOW_DEV_TAG_WRITES !== 'true') {
      logger.debug('[TagSync] Skipping startup sync in development mode (set ALLOW_DEV_TAG_WRITES=true to enable)');
      return { success: true, synced: 0, total: 0, message: 'Startup sync disabled in development mode' };
    }
    
    const cnsOfficialRoleId = rolesConfig().cnsOfficialRole;
    try { await guild.roles.fetch(); } catch {}
    const role = guild.roles.cache.get(cnsOfficialRoleId);
    
    if (!role) {
      logger.warn(`CNS Official role not found: ${cnsOfficialRoleId}`);
      return {
        success: false,
        synced: 0,
        total: 0,
        error: 'CNS Official role not found'
      };
    }
    
    // Get all members with the CNS Official role
    const membersWithRole = role.members;
    const totalTagHolders = membersWithRole.size;
    
    if (totalTagHolders === 0) {
      logger.info('No users currently have the CNS Official role');
      return {
        success: true,
        synced: 0,
        total: 0,
        message: 'No CNS tag holders found'
      };
    }
    
    // Sync existing tag holders in database using guild context
    const syncedCount = syncExistingTagHolders(guild, cnsOfficialRoleId);
    
    logger.info(`Startup sync complete: ${syncedCount}/${totalTagHolders} users synced`);
    
    return {
      success: true,
      synced: syncedCount,
      total: totalTagHolders,
      message: `Synced ${syncedCount} out of ${totalTagHolders} existing tag holders`
    };
    
  } catch (error) {
    logger.error({ err: error }, 'Error during startup tag sync');
    return {
      success: false,
      synced: 0,
      total: 0,
      error: error.message
    };
  }
} 