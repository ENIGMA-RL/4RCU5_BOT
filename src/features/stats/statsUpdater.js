import { EmbedBuilder } from 'discord.js';
import { rolesConfig, channelsConfig } from '../../config/configLoader.js';
import { syncTagRolesFromGuild } from '../tagSync/tagSyncService.js';
import logger from '../../utils/logger.js';

// Function to update server stats
export async function updateStats(client, guildId, channelId) {
  try {
    // Check if client is ready
    if (!client || !client.isReady()) {
      logger.debug('Client not ready, skipping stats update');
      return;
    }

    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      logger.error('Guild not found.');
      return;
    }

    const channel = await guild.channels.fetch(channelId);
    if (!channel) {
      logger.error('Stats channel not found.');
      return;
    }

    // Calculate member count (excluding bots)
    const totalMembers = guild.memberCount;
    const botCount = guild.members.cache.filter(member => member.user.bot).size;
    const humanMembers = totalMembers - botCount;

    // Calculate CNS tags count (members with CNS Official role)
    const cnsOfficialRole = await guild.roles.fetch(rolesConfig().cnsOfficialRole);
    const cnsTagsCount = cnsOfficialRole ? cnsOfficialRole.members.size : 0;

    // Get server boost count
    const boostCount = guild.premiumSubscriptionCount;

    // Create the server statistics embed
    const embed = new EmbedBuilder()
      .setTitle('Server Statistics')
      .setColor('#b544ee')
      .addFields(
        { name: '👥 Members', value: `\`${humanMembers}\``, inline: false },
        { name: '💜 CNS Tags', value: `\`${cnsTagsCount}\``, inline: false },
        { name: '💎 Server Boosts', value: `\`${boostCount}\``, inline: false }
      )
      .setFooter({ 
        text: '4RCU5', 
        iconURL: client.user.displayAvatarURL() 
      })
      .setTimestamp();

    // Find existing stats message
    const messages = await channel.messages.fetch({ limit: 50 });
    const statsMessage = messages.find(msg => 
      msg.author.id === client.user.id && 
      msg.embeds.length > 0 &&
      msg.embeds[0].title === 'Server Statistics'
    );

    if (statsMessage) {
      await statsMessage.edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
    // trace-only if needed
  } catch (error) {
    logger.error({ err: error }, 'Error updating server stats');
  }
}

// Schedule periodic stats updates
export function scheduleStatsUpdate(client, guildId, channelId) {
  logger.info('Starting periodic stats update interval');
  
  // Initial update
  logger.debug('Running initial stats update...');
  updateStats(client, guildId, channelId);
  
  setInterval(async () => {
    try {
      logger.debug('Updating server stats...');
      await updateStats(client, guildId, channelId);
      logger.debug('Server stats updated successfully');
    } catch (error) {
      logger.error({ err: error }, 'Error during periodic stats update');
    }
  }, 5 * 60 * 1000); // 5 minutes
}

// Periodic tag sync: every 5 minutes, sync all users' tag roles using bot token approach
export async function scheduleTagRoleSync(client, guildId) {
  logger.info('Starting periodic tag role sync interval');
  setInterval(async () => {
    try {
      logger.debug('Running periodic tag role sync...');
      let guild = client.guilds.cache.get(guildId);
      if (!guild) {
        // Try to fetch the guild if it's not in cache
        try {
          guild = await client.guilds.fetch(guildId);
          logger.debug(`Fetched guild ${guild.name} (${guild.id}) for tag sync`);
        } catch (fetchError) {
          logger.error({ err: fetchError }, `Could not fetch guild ${guildId} for periodic tag sync`);
          return;
        }
      }
      const result = await syncTagRolesFromGuild(guild, client);
      if (result) {
        logger.info(`Periodic tag sync completed. Members with tag: ${result.count}, Roles added: ${result.updated}, Roles removed: ${result.removed}`);
        // Update stats after successful sync
        await updateStats(client, guild.id, channelsConfig().statsChannelId);
      } else {
        logger.error('Periodic tag sync failed: No result returned');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error during periodic tag role sync');
    }
  }, 5 * 60 * 1000); // 5 minutes
} 