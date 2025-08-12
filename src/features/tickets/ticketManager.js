import { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ticketsConfig, rolesConfig } from '../../config/configLoader.js';

export class TicketManager {
  constructor(client) {
    this.client = client;
  }

  /**
   * Create a new support ticket
   * @param {Object} interaction - The interaction that triggered the ticket creation
   * @returns {Promise<Object>} - Result object with success status and channel info
   */
  async createTicket(interaction) {
    try {
      const config = ticketsConfig();
      if (!config.enabled) {
        return { success: false, error: 'Ticket system is disabled' };
      }

      const guild = interaction.guild;
      const user = interaction.user;
      const category = await guild.channels.fetch(config.categoryId);
      
      if (!category) {
        return { success: false, error: 'Ticket category not found' };
      }

      // Check if user already has open tickets
      const existingTickets = guild.channels.cache.filter(channel => 
        channel.parentId === config.categoryId && 
        channel.name.startsWith(config.ticketChannelPrefix) &&
        channel.topic && channel.topic.includes(user.id)
      );

      if (existingTickets.size >= config.maxOpenTickets) {
        return { 
          success: false, 
          error: `You already have ${existingTickets.size} open tickets. Please close some before creating a new one.` 
        };
      }

      // Create ticket channel
      const ticketChannel = await guild.channels.create({
        name: `${config.ticketChannelPrefix}${user.username}`,
        type: ChannelType.GuildText,
        parent: category,
        topic: `Support ticket for ${user.tag} (${user.id})`,
        permissionOverwrites: [
          {
            id: guild.id, // @everyone role
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.UseExternalEmojis,
              PermissionFlagsBits.AddReactions
            ]
          }
        ]
      });

      // Add staff permissions
      const staffRoles = rolesConfig().adminRoles.concat(rolesConfig().modRoles || []);
      for (const roleId of staffRoles) {
        const role = await guild.roles.fetch(roleId);
        if (role) {
          await ticketChannel.permissionOverwrites.create(role, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true,
            UseExternalEmojis: true,
            AddReactions: true,
            ManageMessages: true,
            ManageChannels: true
          });
        }
      }

      // Create welcome message with close button
      const closeButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`closeTicket|${ticketChannel.id}`)
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒')
        );

      const welcomeEmbed = {
        color: 0x00ff00,
        title: '🎫 Support Ticket Created',
        description: `Welcome ${user}! A staff member will assist you shortly.\n\n**Please describe your issue in detail so we can help you better.**`,
        fields: [
          {
            name: '📝 Guidelines',
            value: '• Be specific about your issue\n• Provide any relevant screenshots\n• Be patient while waiting for staff\n• Stay on topic',
            inline: false
          }
        ],
        timestamp: new Date().toISOString()
      };

      // Get CNS staff role for notification
      const cnsStaffRole = rolesConfig().staffRole;
      const staffPing = cnsStaffRole ? `<@&${cnsStaffRole}>` : '';

      await ticketChannel.send({
        content: `${user} Welcome to your support ticket! ${staffPing}`,
        embeds: [welcomeEmbed],
        components: [closeButton]
      });

      return {
        success: true,
        channel: ticketChannel,
        message: `✅ Support ticket created! Check ${ticketChannel}`
      };

    } catch (error) {
      console.error('Error creating ticket:', error);
      return { success: false, error: 'Failed to create ticket. Please try again.' };
    }
  }

  /**
   * Close a support ticket
   * @param {Object} interaction - The interaction that triggered the ticket closure
   * @param {string} channelId - The ID of the channel to close
   * @returns {Promise<Object>} - Result object with success status
   */
  async closeTicket(interaction, channelId) {
    try {
      const config = ticketsConfig();
      if (!config.enabled) {
        return { success: false, error: 'Ticket system is disabled' };
      }

      const guild = interaction.guild;
      const channel = await guild.channels.fetch(channelId);
      
      if (!channel) {
        return { success: false, error: 'Ticket channel not found' };
      }

      if (channel.parentId !== config.categoryId) {
        return { success: false, error: 'This is not a valid ticket channel' };
      }

      // Check if user has permission to close tickets
      const member = interaction.member;
      const hasPermission = member.permissions.has(PermissionFlagsBits.ManageChannels) ||
        rolesConfig().adminRoles.some(roleId => member.roles.cache.has(roleId)) ||
        rolesConfig().modRoles?.some(roleId => member.roles.cache.has(roleId));

      if (!hasPermission) {
        return { success: false, error: 'You do not have permission to close tickets' };
      }

      // Archive the ticket (optional - you could save messages to a log channel)
      const messages = await channel.messages.fetch({ limit: 100 });
      const ticketLog = messages.map(msg => 
        `[${msg.createdAt.toISOString()}] ${msg.author.tag}: ${msg.content || '[No content]'}`
      ).reverse().join('\n');

      // Send archive to a log channel if configured (optional)
      // You could implement this later

      // Delete the channel
      await channel.delete();

      return {
        success: true,
        message: '✅ Ticket closed successfully'
      };

    } catch (error) {
      console.error('Error closing ticket:', error);
      return { success: false, error: 'Failed to close ticket. Please try again.' };
    }
  }

  /**
   * Get ticket statistics
   * @param {string} guildId - The guild ID
   * @returns {Promise<Object>} - Ticket statistics
   */
  async getTicketStats(guildId) {
    try {
      const config = ticketsConfig();
      if (!config.enabled) return { total: 0, open: 0 };

      const guild = await this.client.guilds.fetch(guildId);
      const category = await guild.channels.fetch(config.categoryId);
      
      if (!category) return { total: 0, open: 0 };

      const ticketChannels = guild.channels.cache.filter(channel => 
        channel.parentId === config.categoryId && 
        channel.name.startsWith(config.ticketChannelPrefix)
      );

      return {
        total: ticketChannels.size,
        open: ticketChannels.size
      };

    } catch (error) {
      console.error('Error getting ticket stats:', error);
      return { total: 0, open: 0 };
    }
  }
} 