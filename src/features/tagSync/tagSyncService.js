import fetch from 'node-fetch';
import { rolesConfig, channelsConfig, isDev } from '../../config/configLoader.js';
import { EmbedBuilder } from 'discord.js';
import { logTagSync } from '../../utils/botLogger.js';
import { setCnsTagEquippedWithGuild, setCnsTagUnequippedWithGuild, syncExistingTagHolders } from '../../repositories/tagRepo.js';
import logger from '../../utils/logger.js';

// Minimal: keep only global backoff; no per-user cache
let globalRateLimitedUntil = 0;

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
export async function checkUserTagStatus(userId, client) {
  try {
    logger.info({ userId }, '[TagSync] checkUserTagStatus: start');
    if (isGloballyRateLimited()) {
      logger.warn({ userId, until: getGlobalRateLimitReset() }, '[TagSync] checkUserTagStatus: globally rate-limited, abort');
      throw new Error('Rate limited: global backoff active');
    }
    logger.debug({ userId }, '[TagSync] checkUserTagStatus: fetching /users/:id');
    // Fetch user data from Discord API using bot token
    const userResponse = await fetch(`https://discord.com/api/users/${userId}`, {
      headers: { Authorization: `Bot ${client.token}`, 'X-Track': '1' }
    });
    logger.debug({ userId, status: userResponse.status, ok: userResponse.ok }, '[TagSync] checkUserTagStatus: fetch complete');
    if (userResponse.status === 429) {
      const retryAfter = setGlobalRateLimitFromHeaders(userResponse);
      logger.warn(`Rate limited when checking tag status for user ${userId}. Next attempt after ${retryAfter} seconds.`);
      throw new Error('Rate limited: 429');
    }
    if (userResponse.status >= 500 && userResponse.status < 600) {
      logger.warn(`Server error (${userResponse.status}) when checking tag status for user ${userId}. Retrying later...`);
      throw new Error(`Server error: ${userResponse.status}`);
    }
    if (!userResponse.ok) {
      logger.error({ userId, status: userResponse.status }, '[TagSync] checkUserTagStatus: non-ok response');
      throw new Error(`Failed to fetch user data: ${userResponse.status}`);
    }
    const userData = await userResponse.json();
    const tagData = userData.primary_guild;
    
    // Debug logging
    logger.info({ userId, hasPrimaryGuild: !!tagData, identityEnabled: tagData?.identity_enabled, identityGuildId: tagData?.identity_guild_id }, '[TagSync] checkUserTagStatus: parsed user data');
    
    // Check if user has tag enabled for our main guild
    const expectedGuildId = rolesConfig().mainGuildId || rolesConfig().main_guild_id || process.env.GUILD_ID;
    const hasTag = Boolean(tagData && tagData.identity_enabled && tagData.identity_guild_id === expectedGuildId);

    logger.info({ userId, expectedGuildId, hasTag }, '[TagSync] checkUserTagStatus: computed hasTag');

    return { userId, isUsingTag: hasTag, tagData, userData };
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
export async function syncUserTagRole(userId, guild, client) {
  try {
    logger.info({ userId, guildId: guild?.id }, '[TagSync] syncUserTagRole: start');
    if (isGloballyRateLimited()) {
      return { success: false, error: 'rate_limited' };
    }
    // Skip tag sync in development mode
    if (isDev()) {
      logger.debug(`[TagSync] Skipping tag sync for user ${userId} in development mode`);
      return { success: true, action: 'skipped', user: 'Development Mode', reason: 'Tag sync disabled in development' };
    }
    const tagStatus = await checkUserTagStatus(userId, client);
    logger.info({ userId, isUsingTag: tagStatus.isUsingTag }, '[TagSync] syncUserTagRole: tag status');
    
    // Get the member object
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      logger.warn({ userId, guildId: guild.id }, '[TagSync] syncUserTagRole: member not found in guild');
      return { success: false, error: 'Member not found' };
    }

    const cnsOfficialRoleId = rolesConfig().cnsOfficialRole;
    const hasRole = member.roles.cache.has(cnsOfficialRoleId);
    logger.debug({ userId, cnsOfficialRoleId, hasRole }, '[TagSync] syncUserTagRole: role presence');

    if (tagStatus.isUsingTag) {
      // User has tag enabled - add role if they don't have it
      if (!hasRole) {
        logger.info({ userId, roleId: cnsOfficialRoleId }, '[TagSync] syncUserTagRole: adding role');
        await member.roles.add(cnsOfficialRoleId, 'Server tag enabled');
        
        // Track tag equipment in database
        logger.debug(`About to call setCnsTagEquippedWithGuild for user ${userId} in guild ${guild.id}`);
        setCnsTagEquippedWithGuild(userId, guild.id);
        logger.debug(`Called setCnsTagEquippedWithGuild for user ${userId}`);
        
        // Log the role assignment
        const role = guild.roles.cache.get(cnsOfficialRoleId);
        if (role) {
          await logTagSync(guild.client, member.id, member.user.tag, 'Added', 'Server tag enabled');
        }
        logger.info({ userId }, '[TagSync] syncUserTagRole: add complete');
        return { 
          success: true, 
          action: 'added', 
          user: member.user.tag,
          reason: 'Server tag enabled'
        };
      } else {
        logger.info({ userId }, '[TagSync] syncUserTagRole: no_change (already had role)');
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
        logger.info({ userId, roleId: cnsOfficialRoleId }, '[TagSync] syncUserTagRole: removing role');
        await member.roles.remove(cnsOfficialRoleId, 'Server tag disabled');
        
        // Track tag unequipment in database
        logger.debug(`About to call setCnsTagUnequippedWithGuild for user ${userId} in guild ${guild.id}`);
        setCnsTagUnequippedWithGuild(userId, guild.id);
        logger.debug(`Called setCnsTagUnequippedWithGuild for user ${userId}`);
        
        // Log the role removal
        const role = guild.roles.cache.get(cnsOfficialRoleId);
        if (role) {
          await logTagSync(guild.client, member.id, member.user.tag, 'Removed', 'Server tag disabled');
        }
        logger.info({ userId }, '[TagSync] syncUserTagRole: remove complete');
        return { 
          success: true, 
          action: 'removed', 
          user: member.user.tag,
          reason: 'Server tag disabled'
        };
      } else {
        logger.info({ userId }, '[TagSync] syncUserTagRole: no_change (did not have role)');
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
    // Skip tag sync in development mode
    if (isDev()) {
      logger.debug('[TagSync] Skipping bulk tag sync in development mode');
      return { success: true, processed: 0, successCount: 0, errorCount: 0, results: [], message: 'Tag sync disabled in development mode' };
    }
    if (isGloballyRateLimited()) {
      return { success: false, error: 'rate_limited' };
    }
    
    // Fetch all members in the guild
    logger.info({ guildId: guild.id }, '[TagSync] syncAllUserTags: fetching members');
    const members = await guild.members.fetch();
    logger.info({ guildId: guild.id, count: members.size }, '[TagSync] syncAllUserTags: members fetched');
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Process users in batches to avoid rate limits
    const batchSize = 2; // Lower batch size for less rate limiting
    const memberArray = Array.from(members.values());
    
    for (let i = 0; i < memberArray.length; i += batchSize) {
      const batch = memberArray.slice(i, i + batchSize);
      logger.debug({ start: i, end: i + batchSize }, '[TagSync] syncAllUserTags: processing batch');
      
      const batchPromises = batch.map(async (member) => {
        try {
          const result = await syncUserTagRole(member.id, guild, client);
          logger.debug({ userId: member.id, result }, '[TagSync] syncAllUserTags: user processed');
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
  // Skip tag sync in development mode
  if (isDev()) {
    logger.debug('[TagSync] Skipping tag guild sync in development mode');
    return { count: 0, updated: 0, removed: 0 };
  }
  if (isGloballyRateLimited()) {
    return { count: 0, updated: 0, removed: 0 };
  }
  
  const expectedGuildId = rolesConfig().mainGuildId || rolesConfig().main_guild_id || process.env.GUILD_ID;
  const tagRoleId = rolesConfig().cnsOfficialRole;
  const statsChannelId = channelsConfig().statsChannelId;
  const MAX_PER_RUN = Number(process.env.TAG_SYNC_MAX_PER_RUN || 50);

  // Fetch all members in the main guild
  logger.info({ guildId: mainGuild.id }, '[TagSync] syncTagRolesFromGuild: fetching members');
  const mainGuildMembers = await mainGuild.members.fetch();
  logger.info({ guildId: mainGuild.id, count: mainGuildMembers.size }, '[TagSync] syncTagRolesFromGuild: members fetched');
  let count = 0;
  let updated = 0;
  let removed = 0;
  let processed = 0;

  for (const member of mainGuildMembers.values()) {
    try {
      // Fetch user data from Discord API to check their primary guild
      const userResponse = await fetch(`https://discord.com/api/users/${member.user.id}`, {
        headers: { Authorization: `Bot ${client.token}`, 'X-Track': '1' }
      });
      logger.debug({ userId: member.user.id, status: userResponse.status }, '[TagSync] syncTagRolesFromGuild: fetched /users/:id');

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
      const hasTag = tagData && tagData.identity_enabled && tagData.identity_guild_id === expectedGuildId;

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
    // Skip in development mode
    if (isDev()) {
      logger.debug('[TagSync] Skipping startup sync in development mode');
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
    logger.info({ totalTagHolders }, '[TagSync] startup sync: found existing holders');
    
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