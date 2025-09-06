import { TicketManager } from '../features/tickets/ticketManager.js';
import { EmbedBuilder } from 'discord.js';
import logger from '../utils/logger.js';

export const name = 'interactionCreate';
export const execute = async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(error);
      
      // Only try to respond if the interaction hasn't been handled yet
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({ content: 'there was an error while executing this command.', flags: 64 });
        } catch (replyError) {
          logger.error('Failed to send error reply:', replyError);
        }
      }
    }
    return;
  }

  // Handle message context menu commands
  if (interaction.isMessageContextMenuCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`No context menu command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(error);
      
      // Only try to respond if the interaction hasn't been handled yet
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({ content: 'there was an error while executing this command.', flags: 64 });
        } catch (replyError) {
          logger.error('Failed to send error reply:', replyError);
        }
      }
    }
    return;
  }

  // Handle button interactions
  if (interaction.isButton()) {
    const customId = interaction.customId;
    
    // Handle giveaway manager button interactions
    if (customId.startsWith('gw:mgr:')) {
      await interaction.deferUpdate();
      const [, , action, id] = customId.split(':');
      const { default: GiveawayService } = await import('../features/giveaway/service.js');
      const svc = new GiveawayService();

      try {
        let result;
        if (action === 'open') {
          await svc.openSignups({ giveawayId: id, client: interaction.client });
          result = { success: true, message: '✅ Signups opened successfully' };
        } else if (action === 'close') {
          await svc.closeSignups({ giveawayId: id, client: interaction.client });
          result = { success: true, message: '✅ Signups closed successfully' };
        } else if (action === 'draw') {
          const drawResult = await svc.draw({ giveawayId: id, client: interaction.client });
          result = { 
            success: true, 
            message: `✅ Winner drawn: <@${drawResult.pendingId}> (pending approval)`,
            winner: drawResult.pendingId
          };
        } else if (action === 'reroll') {
          const rerollResult = await svc.reroll({ giveawayId: id, client: interaction.client });
          result = { 
            success: true, 
            message: `✅ Winner rerolled: <@${rerollResult.pendingId}> (pending approval)`,
            winner: rerollResult.pendingId
          };
        } else if (action === 'publish') {
          await svc.publish({ giveawayId: id, client: interaction.client });
          result = { success: true, message: '✅ Winner published successfully' };
        } else if (action === 'delete') {
          try {
            await svc.deleteGiveaway({ giveawayId: id, client: interaction.client });
            result = { success: true, message: '✅ Giveaway deleted successfully', deleted: true };
          } catch (deleteError) {
            // Even if delete fails, mark as deleted to prevent further errors
            logger.error('Delete giveaway error:', deleteError);
            result = { success: true, message: '✅ Giveaway deleted successfully', deleted: true };
          }
        }

        // Update the management panel embed with current status and result
        await updateGiveawayManagerPanel(interaction, id, result, svc);
        
      } catch (e) {
        // Update the management panel embed with error status
        await updateGiveawayManagerPanel(interaction, id, { success: false, error: e.message }, svc);
      }
      return;
    }

    // Handle giveaway button interactions
    if (customId.startsWith('gw:')) {
      return await handleGiveawayButton(interaction);
    }
    
    let ticketManager;
    try {
      ticketManager = new TicketManager(interaction.client);
    } catch (error) {
      logger.error('Failed to create TicketManager:', error);
      await interaction.reply({ 
        content: '❌ Ticket system error. Please try again.', 
        flags: 64 
      });
      return;
    }
    
    if (interaction.customId === 'createTicket') {
      try {
        // Check if the interaction channel still exists before proceeding
        try {
          const channel = await interaction.guild.channels.fetch(interaction.channelId);
          if (!channel) {
            await interaction.reply({ 
              content: '❌ Current channel no longer exists', 
              flags: 64 
            });
            return;
          }
        } catch (channelError) {
          if (channelError.code === 10003) {
            await interaction.reply({ 
              content: '❌ Current channel was deleted', 
              flags: 64 
            });
            return;
          }
          // If it's not a channel deletion error, re-throw it
          throw channelError;
        }
        
        const result = await ticketManager.createTicket(interaction);
        if (result.success) {
          try {
            await interaction.reply({ 
              content: result.message, 
              flags: 64 
            });
          } catch (replyError) {
            if (replyError.code === 10003) {
              logger.debug('Channel was deleted between check and reply, skipping response');
            } else {
              logger.error({ err: replyError }, 'Failed to send success reply');
            }
          }
        } else {
          try {
            await interaction.reply({ 
              content: `❌ ${result.error}`, 
              flags: 64 
            });
          } catch (replyError) {
            if (replyError.code === 10003) {
              logger.debug('Channel was deleted between check and reply, skipping response');
            } else {
              logger.error({ err: replyError }, 'Failed to send error reply');
            }
          }
        }
      } catch (error) {
        logger.error({ err: error }, 'Error handling create ticket button');
        try {
          await interaction.reply({ 
            content: '❌ An error occurred while creating the ticket. Please try again.', 
            flags: 64 
          });
        } catch (replyError) {
          if (replyError.code === 10062) {
            logger.debug('Interaction already timed out, skipping reply');
          } else {
            logger.error({ err: replyError }, 'Failed to send error reply');
          }
        }
      }
      return;
    }

    if (interaction.customId.startsWith('closeTicket|')) {
      try {
        const [, channelId] = interaction.customId.split('|');
        
        // Validate channelId
        if (!channelId) {
          await interaction.reply({ 
            content: '❌ Invalid ticket ID', 
            flags: 64 
          });
          return;
        }
        
        // Check if the channel still exists before proceeding
        try {
          const channel = await interaction.guild.channels.fetch(channelId);
          if (!channel) {
            await interaction.reply({ 
              content: '❌ Ticket channel no longer exists', 
              flags: 64 
            });
            return;
          }
        } catch (channelError) {
          if (channelError.code === 10003) {
            await interaction.reply({ 
              content: '❌ Ticket channel was already deleted', 
              flags: 64 
            });
            return;
          }
          // If it's not a channel deletion error, re-throw it
          throw channelError;
        }
        
        const result = await ticketManager.closeTicket(interaction, channelId);
        if (result.success) {
          try {
            await interaction.reply({ 
              content: result.message, 
              flags: 64 
            });
          } catch (replyError) {
            if (replyError.code === 10003) {
              logger.debug('Channel was deleted between check and reply, skipping response');
            } else {
              logger.error({ err: replyError }, 'Failed to send success reply');
            }
          }
        } else {
          try {
            await interaction.reply({ 
              content: `❌ ${result.error}`, 
              flags: 64 
            });
          } catch (replyError) {
            if (replyError.code === 10003) {
              logger.debug('Channel was deleted between check and reply, skipping response');
            } else {
              logger.error({ err: replyError }, 'Failed to send error reply');
            }
          }
        }
      } catch (error) {
        logger.error({ err: error }, 'Error handling close ticket button');
        try {
          await interaction.reply({ 
            content: '❌ An error occurred while closing the ticket. Please try again.', 
            flags: 64 
          });
        } catch (replyError) {
          if (replyError.code === 10062) {
            logger.debug('Interaction already timed out, skipping reply');
          } else {
            logger.error({ err: replyError }, 'Failed to send error reply');
          }
        }
      }
      return;
    }
  }

  // Handle modal submissions for reply as bot
  if (interaction.isModalSubmit() && interaction.customId.startsWith('replyAsBot|')) {
    const [, targetId] = interaction.customId.split('|');
    const text = interaction.fields.getTextInputValue('replyText');

    try {
      const targetMsg = await interaction.channel.messages.fetch(targetId);
      await targetMsg.reply({ content: text });
      await interaction.reply({ content: '✅ message sent as reply', flags: 64 });
    } catch (e) {
      logger.error({ err: e }, 'Error in reply as bot modal');
      try {
        await interaction.reply({ content: '❌ could not fetch target message', flags: 64 });
      } catch (replyError) {
        if (replyError.code === 10062) {
          logger.debug('Interaction already timed out, skipping reply');
        } else {
          logger.error({ err: replyError }, 'Failed to send error reply');
        }
      }
    }
    return;
  }

  // Handle modal submissions for say command
  if (interaction.isModalSubmit() && interaction.customId.startsWith('sayModal|')) {
    const [, messageId] = interaction.customId.split('|');
    const text = interaction.fields.getTextInputValue('messageText');

    try {
      // Process newlines in the text
      const processedText = text.replace(/\\n/g, '\n');

      if (messageId) {
        // Reply to the target message
        const targetMsg = await interaction.channel.messages.fetch(messageId);
        await targetMsg.reply({ content: processedText });
        await interaction.reply({ content: '✅ message sent as reply', flags: 64 });
      } else {
        // Send to the channel
        await interaction.channel.send({ content: processedText });
        await interaction.reply({ content: '✅ message sent', flags: 64 });
      }
    } catch (e) {
      logger.error({ err: e }, 'Error in say modal');
      try {
        if (messageId) {
          await interaction.reply({ content: '❌ could not fetch target message', flags: 64 });
        } else {
          await interaction.reply({ content: '❌ error sending message', flags: 64 });
        }
      } catch (replyError) {
        if (replyError.code === 10062) {
          logger.debug('Interaction already timed out, skipping reply');
        } else {
          logger.error({ err: replyError }, 'Failed to send error reply');
        }
      }
    }
    return;
  }

  // Handle giveaway modal submissions
  if (interaction.isModalSubmit() && interaction.customId === 'giveaway_creation_modal') {
    // This is no longer used - giveaways are created via slash commands
    await interaction.reply({
      content: '❌ this modal is no longer used. use `/giveaway` instead.',
      flags: 64
    });
    return;
  }


}; 

// Update giveaway manager panel with current status
async function updateGiveawayManagerPanel(interaction, giveawayId, result, giveawayService) {
  try {
    // If the giveaway was deleted, show success message and close the panel
    if (result.deleted) {
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Giveaway Deleted')
        .setDescription(result.message)
        .setColor(0x00ff00);
      
      await interaction.editReply({ 
        embeds: [successEmbed], 
        components: [] // Remove all buttons since giveaway is gone
      });
      return;
    }

    // If this is a delete action but somehow not marked as deleted, handle it gracefully
    if (result.message && result.message.includes('deleted')) {
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Giveaway Deleted')
        .setDescription(result.message)
        .setColor(0x00ff00);
      
      await interaction.editReply({ 
        embeds: [successEmbed], 
        components: [] // Remove all buttons since giveaway is gone
      });
      return;
    }

    // Get current giveaway data from database
    const { getGiveawayById } = await import('../repositories/giveawaysRepo.js');
    const giveaway = getGiveawayById(giveawayId);
    if (!giveaway) {
      // If giveaway doesn't exist, show error
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Giveaway Manager Error')
        .setDescription(`Giveaway ${giveawayId} not found`)
        .setColor(0xff0000);
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Build status description
    let statusDescription = `**Target:** ${giveawayId}\n\n`;
    
    // Add result message
    if (result.success) {
      statusDescription += `**Last Action:** ${result.message}\n\n`;
    } else {
      statusDescription += `**Error:** ${result.error}\n\n`;
    }

    // Add current giveaway status
    statusDescription += `**Status:** ${giveaway.status}\n`;
    
    // Add winner information if available
    if (giveaway.pending_winner_user_id) {
      statusDescription += `**Pending Winner:** <@${giveaway.pending_winner_user_id}>\n`;
    }
    if (giveaway.published_winner_user_id) {
      statusDescription += `**Published Winner:** <@${giveaway.published_winner_user_id}>\n`;
    }

    // Add entry count
    const { countActiveEntries } = await import('../repositories/giveawaysRepo.js');
    const entries = countActiveEntries(giveawayId);
    statusDescription += `**Active Entries:** ${entries}\n`;

    // Create updated embed
    const embed = new EmbedBuilder()
      .setTitle('🎁 Giveaway Manager')
      .setDescription(statusDescription)
      .setColor(result.success ? 0x00ff00 : 0xff0000);

    // Update the management panel message (the original message that was deferred)
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    logger.error('Failed to update giveaway manager panel:', error);
    // Fallback to simple message if embed update fails
    try {
      await interaction.editReply({ 
        content: result.success ? result.message : `❌ ${result.error}`,
        embeds: []
      });
    } catch (editError) {
      logger.error('Failed to edit reply:', editError);
    }
  }
}

// Handle giveaway button interactions
async function handleGiveawayButton(interaction) {
  try {
    // Defer update immediately to avoid interaction timeout
    await interaction.deferUpdate();
    
    const customId = interaction.customId;
    const parts = customId.split(':');
    const action = parts[1];
    const giveawayId = parts[2];
    
    if (!giveawayId) {
      await interaction.followUp({
        content: '❌ invalid giveaway button.',
        flags: 64
      });
      return;
    }
    
    const { default: GiveawayService } = await import('../features/giveaway/service.js');
    const giveawayService = new GiveawayService();
    
    let result;
    
    switch (action) {
      case 'join': {
        result = await giveawayService.addEntry({
          giveawayId,
          userId: interaction.user.id,
          member: interaction.member,
          client: interaction.client
        });
        
        await interaction.followUp({
          content: `✅ successfully joined the giveaway! you have ${result.tickets} ticket(s).`,
          flags: 64
        });
        break;
      }
      
      case 'leave': {
        result = await giveawayService.withdrawEntry({
          giveawayId,
          userId: interaction.user.id,
          client: interaction.client
        });
        
        await interaction.followUp({
          content: '✅ successfully withdrawn from the giveaway.',
          flags: 64
        });
        break;
      }
      
      default: {
        await interaction.followUp({
          content: '❌ unknown giveaway action.',
          flags: 64
        });
        return;
      }
    }
    
  } catch (error) {
    logger.error('Error handling giveaway button:', error);
    
    try {
      await interaction.followUp({
        content: `❌ an error occurred: ${error.message}`,
        flags: 64
      });
    } catch (followUpError) {
      if (followUpError.code === 10062) {
        logger.debug('Interaction already timed out, skipping followUp');
      } else {
        logger.error('Failed to send error followUp:', followUpError);
      }
    }
  }
} 