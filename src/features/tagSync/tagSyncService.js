import fetch from 'node-fetch';
import { rolesConfig, channelsConfig, isDev } from '../../config/configLoader.js';
import { EmbedBuilder } from 'discord.js';
import { logTagSync } from '../../utils/botLogger.js';

/**
 * Check if user has server tag enabled using bot token
 * @param {string} userId - The user ID to check
 * @param {Client} client - The Discord client
 * @returns {Promise<{userId: string, isUsingTag: boolean, tagData: any, userData: any}>}
 */
export async function checkUserTagStatus(userId, client) {
  try {
    // Fetch user data from Discord API using bot token
    const userResponse = await fetch(`https://discord.com/api/users/${userId}`, {
      headers: {
        Authorization: `Bot ${client.token}`,
      },
    });

    // Handle rate limiting
    if (userResponse.status === 429) {
      const retryAfter = userResponse.headers.get('retry-after') || 1;
      console.warn(`Rate limited when checking tag status for user ${userId}. Retrying after ${retryAfter} seconds.`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      throw new Error(`Rate limited: ${userResponse.status}`);
    }

    // Handle server errors (5xx) with retry logic
    if (userResponse.status >= 500 && userResponse.status < 600) {
      console.warn(`Server error (${userResponse.status}) when checking tag status for user ${userId}. Retrying in 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      throw new Error(`Server error: ${userResponse.status}`);
    }

    if (!userResponse.ok) {
      throw new Error(`Failed to fetch user data: ${userResponse.status}`);
    }

    const userData = await userResponse.json();
    const tagData = userData.primary_guild;
    
    // Debug logging
    if (isDev()) {
      console.log(`[TagSync Debug] User ${userId} data:`, {
        hasPrimaryGuild: !!tagData,
        primaryGuild: tagData,
        identityEnabled: tagData?.identity_enabled,
        identityGuildId: tagData?.identity_guild_id,
        expectedGuildId: rolesConfig().tagGuildId
      });
    }
    
    // Check if user has tag enabled for the configured guild
    const tagGuildId = rolesConfig().tagGuildId;
    const hasTag = tagData && 
                  tagData.identity_enabled && 
                  tagData.identity_guild_id === tagGuildId;

    if (isDev()) {
      console.log(`[TagSync Debug] User ${userId} hasTag: ${hasTag}`);
    }

    return {
      userId,
      isUsingTag: hasTag,
      tagData,
      userData
    };
  } catch (error) {
    console.error(`Error checking tag status for user ${userId}:`, error);
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
    
    // Skip tag sync in development mode
    if (isDev()) {
      console.log(`[TagSync] Skipping tag sync for user ${userId} in development mode`);
      return { 
        success: true, 
        action: 'skipped', 
        user: 'Development Mode',
        reason: 'Tag sync disabled in development'
      };
    }
    
    // Check user's tag status using bot token
    const tagStatus = await checkUserTagStatus(userId, client);
    
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
        
        // Log the role assignment
        const role = guild.roles.cache.get(cnsOfficialRoleId);
        if (role) {
          await logTagSync(guild.client, member.id, member.user.tag, 'Added', 'Server tag enabled');
        }
        
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
        
        // Log the role removal
        const role = guild.roles.cache.get(cnsOfficialRoleId);
        if (role) {
          await logTagSync(guild.client, member.id, member.user.tag, 'Removed', 'Server tag disabled');
        }
        
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
    console.error(`Error syncing tag role for user ${userId}:`, error);
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
      console.log(`[TagSync] Skipping bulk tag sync in development mode`);
      return {
        success: true,
        processed: 0,
        successCount: 0,
        errorCount: 0,
        results: [],
        message: 'Tag sync disabled in development mode'
      };
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
            console.warn(`Server error when processing user ${member.id}. Will retry in next batch.`);
            // Don't increment error count for server errors as they will be retried
            return { 
              success: false, 
              error: error.message,
              userId: member.id,
              retryable: true
            };
          }
          
          errorCount++;
          console.error(`Error processing user ${member.id}:`, error);
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
    console.error('Error in bulk tag sync:', error);
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
    console.log(`[TagSync] Skipping tag guild sync in development mode`);
    return { count: 0, updated: 0, removed: 0 };
  }
  
  const tagGuildId = rolesConfig().tagGuildId;
  const tagRoleId = rolesConfig().cnsOfficialRole;
  const statsChannelId = channelsConfig().statsChannelId;

  // Fetch all members in the main guild
  const mainGuildMembers = await mainGuild.members.fetch();
  let count = 0;
  let updated = 0;
  let removed = 0;

  for (const member of mainGuildMembers.values()) {
    try {
      // Fetch user data from Discord API to check their primary guild
      const userResponse = await fetch(`https://discord.com/api/users/${member.user.id}`, {
        headers: {
          Authorization: `Bot ${client.token}`,
        },
      });

      if (userResponse.status === 429) {
        const retryAfter = userResponse.headers.get('retry-after') || 1;
        console.warn(`Rate limited. Retrying after ${retryAfter} seconds.`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      // Handle server errors (5xx) with retry logic
      if (userResponse.status >= 500 && userResponse.status < 600) {
        console.warn(`Server error (${userResponse.status}) for ${member.user.tag}. Retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      if (!userResponse.ok) {
        console.warn(`Could not fetch user data for ${member.user.tag}: ${userResponse.status}`);
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
        await logTagSync(client, member.id, member.user.tag, 'Added', 'Bulk sync - Has CNS tag enabled');
      } else if (!hasTag && hasRole) {
        await member.roles.remove(tagRoleId, 'No CNS tag enabled for tag guild');
        removed++;
        await logTagSync(client, member.id, member.user.tag, 'Removed', 'Bulk sync - No CNS tag enabled');
      }
    } catch (error) {
      console.error(`Error processing member ${member.user.tag}:`, error);
    }
    // Add short delay between each user to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 seconds
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
      console.error('Error updating stats embed:', error);
    }
  }

  return { count, updated, removed };
} 