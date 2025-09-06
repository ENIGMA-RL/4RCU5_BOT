import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { staffConfig, rolesConfig, channelsConfig } from '../../config/configLoader.js';
import { TicketManager } from '../tickets/ticketManager.js';
import logger from '../../utils/logger.js';

export async function updateStaffEmbed(client, guildId, channelId) {
  let guild, channel;
  logger.debug(`[StaffEmbed] Attempting to update staff embed for guildId: ${guildId}, channelId: ${channelId}`);
  try {
    guild = await client.guilds.fetch(guildId);
    if (!guild) {
      logger.error('[StaffEmbed] Guild not found for staff embed update.');
      return;
    }
    logger.debug(`[StaffEmbed] Fetched guild: ${guild.name} (${guild.id})`);
    // Log all channel IDs in the guild
    const allChannels = await guild.channels.fetch();
    const channelIds = Array.from(allChannels.values()).map(c => `${c.name} (${c.id}) [type: ${c.type}]`);
    logger.trace({ channelIds }, '[StaffEmbed] Guild channels');
    await guild.members.fetch();
    channel = await guild.channels.fetch(channelId).catch(e => {
      logger.error({ err: e }, '[StaffEmbed] Error fetching channel');
      return null;
    });
    if (!channel) {
      logger.error(`[StaffEmbed] Staff channel not found for ID: ${channelId}`);
      return;
    }
    logger.debug(`[StaffEmbed] Fetched channel: ${channel.name} (${channel.id}), type: ${channel.type}`);
    if (!channel.isTextBased()) {
      logger.error('[StaffEmbed] Staff channel is not a text channel.');
      return;
    }
    if (channel.guildId !== guildId) {
      logger.error(`[StaffEmbed] Channel's guildId (${channel.guildId}) does not match expected guildId (${guildId})`);
      return;
    }
  } catch (error) {
    logger.error({ err: error }, '[StaffEmbed] Error fetching guild or channel for staff embed');
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
        logger.error(`Staff role ${roleConfig.id} not found.`);
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

    // Add spacing field
    embed.addFields({
      name: '',
      value: '',
      inline: false,
    });

    // Add support message field
    embed.addFields({
      name: '📋 Support',
      value: 'Need help? Click the button below to create a support ticket.',
      inline: false,
    });

    // Add ticket button as a field
    const ticketButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('createTicket')
          .setLabel('Open Support Ticket')
          .setStyle(ButtonStyle.Primary)
      );

    // Add last updated footer with avatar
    embed.setFooter({ 
      text: '4RCU5', 
      iconURL: client.user.displayAvatarURL() 
    });

    // Find the most recent staff embed in the channel
    const messages = await channel.messages.fetch({ limit: 10 });
    const staffMsg = messages.find(msg => msg.embeds[0]?.title === '👥 CNS Staff Team');
    if (staffMsg) {
      await staffMsg.edit({ embeds: [embed], components: [ticketButton] });
    } else {
      await channel.send({ embeds: [embed], components: [ticketButton] });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error updating staff embed');
  }
}

export async function refreshStaffEmbed(client) {
  // Get the guild ID from the client's guilds
  const guild = client.guilds.cache.first();
  if (!guild) {
    logger.error('[StaffEmbed] No guilds available for refresh');
    return;
  }
  const guildId = guild.id;
  const channelId = channelsConfig().staffChannelId;
  await updateStaffEmbed(client, guildId, channelId);
}

export function scheduleStaffEmbedUpdate(client, guildId, channelId) {
  logger.info('Scheduling staff embed updates every 5 minutes');
  setInterval(async () => {
    try {
      logger.debug('Updating staff embed...');
      await updateStaffEmbed(client, guildId, channelId);
      logger.debug('Staff embed updated successfully');
    } catch (error) {
      logger.error({ err: error }, 'Error in scheduled staff embed update');
    }
  }, 5 * 60 * 1000);

  // Initial update
  logger.debug('Running initial staff embed update...');
  updateStaffEmbed(client, guildId, channelId);
}
