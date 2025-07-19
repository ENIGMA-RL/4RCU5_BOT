import { EmbedBuilder } from 'discord.js';
import { staffConfig, rolesConfig, channelsConfig } from '../../config/configLoader.js';


export async function updateStaffEmbed(client, guildId, channelId) {
  let guild, channel;
  console.log(`[StaffEmbed] Attempting to update staff embed for guildId: ${guildId}, channelId: ${channelId}`);
  try {
    guild = await client.guilds.fetch(guildId);
    if (!guild) {
      console.error('[StaffEmbed] Guild not found for staff embed update.');
      return;
    }
    console.log(`[StaffEmbed] Fetched guild: ${guild.name} (${guild.id})`);
    // Log all channel IDs in the guild
    const allChannels = await guild.channels.fetch();
    const channelIds = Array.from(allChannels.values()).map(c => `${c.name} (${c.id}) [type: ${c.type}]`);
    console.log(`[StaffEmbed] Guild channels:`, channelIds);
    await guild.members.fetch();
    channel = await guild.channels.fetch(channelId).catch(e => {
      console.error(`[StaffEmbed] Error fetching channel: ${e}`);
      return null;
    });
    if (!channel) {
      console.error(`[StaffEmbed] Staff channel not found for ID: ${channelId}`);
      return;
    }
    console.log(`[StaffEmbed] Fetched channel: ${channel.name} (${channel.id}), type: ${channel.type}`);
    if (!channel.isTextBased()) {
      console.error('[StaffEmbed] Staff channel is not a text channel.');
      return;
    }
    if (channel.guildId !== guildId) {
      console.error(`[StaffEmbed] Channel's guildId (${channel.guildId}) does not match expected guildId (${guildId})`);
      return;
    }
  } catch (error) {
    console.error('[StaffEmbed] Error fetching guild or channel for staff embed:', error);
    return;
  }

  try {
    const embed = new EmbedBuilder()
      .setTitle('👥 CNS Staff Team')
      .setDescription('Meet our dedicated staff members who keep CNS running smoothly!')
      .setColor('#b544ee')
      .setTimestamp();

    for (const roleConfig of staffConfig().staffRoles) {
      const role = await guild.roles.fetch(roleConfig.id);
      if (!role) {
        console.error(`Staff role ${roleConfig.id} not found.`);
        continue;
      }
      const members = role.members;
      let value;
      if (members.size === 0) {
        value = `<@&${role.id}>\n*No members currently*`;
      } else {
        value = `<@&${role.id}>\n` + members.map(member => `• ${member.toString()}`).join('\n');
      }
      embed.addFields({
        name: '',
        value,
        inline: false,
      });
    }

    // Add last updated footer with avatar
    embed.setFooter({ 
      text: '4RCU5', 
      iconURL: client.user.displayAvatarURL() 
    });

    // Find the most recent staff embed in the channel
    const messages = await channel.messages.fetch({ limit: 10 });
    const staffMsg = messages.find(msg => msg.embeds[0]?.title === '👥 CNS Staff Team');
    if (staffMsg) {
      await staffMsg.edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Error updating staff embed:', error);
  }
}

export async function refreshStaffEmbed(client) {
  // Get the guild ID from the client's guilds
  const guild = client.guilds.cache.first();
  if (!guild) {
    console.error('[StaffEmbed] No guilds available for refresh');
    return;
  }
  const guildId = guild.id;
  const channelId = channelsConfig().staffChannelId;
  await updateStaffEmbed(client, guildId, channelId);
}

export function scheduleStaffEmbedUpdate(client, guildId, channelId) {
  console.log('📋 Scheduling staff embed updates every 5 minutes');
  setInterval(async () => {
    try {
      console.log('📋 Updating staff embed...');
      await updateStaffEmbed(client, guildId, channelId);
      console.log('✅ Staff embed updated successfully');
    } catch (error) {
      console.error('❌ Error in scheduled staff embed update:', error);
    }
  }, 5 * 60 * 1000);

  // Initial update
  console.log('📋 Running initial staff embed update...');
  updateStaffEmbed(client, guildId, channelId);
}
