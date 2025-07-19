import { EmbedBuilder } from 'discord.js';
import { rolesConfig, channelsConfig } from '../../config/configLoader.js';
import { syncTagRolesFromGuild } from '../tagSync/tagSyncService.js';

// Function to update server stats
export async function updateStats(client, guildId, channelId) {
  const guild = await client.guilds.fetch(guildId);
  if (!guild) {
    console.error('Guild not found.');
    return;
  }

  const channel = await guild.channels.fetch(channelId);
  if (!channel) {
    console.error('Stats channel not found.');
    return;
  }

  try {
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
    // Optionally keep this log if you want to track stats updates
    // console.log(`Updated server stats: ${humanMembers} members, ${cnsTagsCount} CNS tags, ${boostCount} boosts`);
  } catch (error) {
    console.error('Error updating server stats:', error);
  }
}

// Schedule periodic stats updates
export function scheduleStatsUpdate(client, guildId, channelId) {
  console.log('📊 Starting periodic stats update interval');
  
  // Initial update
  console.log('📊 Running initial stats update...');
  updateStats(client, guildId, channelId);
  
  setInterval(async () => {
    try {
      console.log('📊 Updating server stats...');
      await updateStats(client, guildId, channelId);
      console.log('✅ Server stats updated successfully');
    } catch (error) {
      console.error('Error during periodic stats update:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
}

// Periodic tag sync: every 5 minutes, sync all users' tag roles using bot token approach
export async function scheduleTagRoleSync(client) {
  console.log('🔄 Starting periodic tag role sync interval');
  setInterval(async () => {
    try {
      console.log('🔄 Running periodic tag role sync...');
      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      if (!guild) {
        console.error('❌ No guild found for periodic tag sync');
        return;
      }
      const result = await syncTagRolesFromGuild(guild, client);
      if (result) {
        console.log(`✅ Periodic tag sync completed. Members with tag: ${result.count}, Roles added: ${result.updated}, Roles removed: ${result.removed}`);
        // Update stats after successful sync
        await updateStats(client, guild.id, channelsConfig().statsChannelId);
      } else {
        console.error('❌ Periodic tag sync failed: No result returned');
      }
    } catch (error) {
      console.error('Error during periodic tag role sync:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
} 