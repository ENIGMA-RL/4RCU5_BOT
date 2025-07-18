import { ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import rolesConfig from '../../config/roles.json' with { type: 'json' };

export const data = {
  name: 'purge',
  description: 'Deletes messages from the current channel. Only CNS Developers can use this.',
  options: [
    {
      name: 'count',
      type: ApplicationCommandOptionType.Integer,
      description: 'Number of messages to delete (leave empty to delete all)',
      required: false,
      min_value: 1,
      max_value: 100
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  // Only allow CNS Developer role
  const memberRoles = interaction.member.roles.cache;
  const isCnsDev = Array.from(memberRoles.keys()).includes(rolesConfig.cnsDeveloperRole);
  if (!isCnsDev) {
    await interaction.reply({
      content: '❌ Only users with the CNS Developer role can use this command.',
      flags: 64
    });
    return;
  }

  const count = interaction.options.getInteger('count');
  const isPurgeAll = !count;

  // Create confirmation buttons
  const confirmButton = new ButtonBuilder()
    .setCustomId('confirm_purge')
    .setLabel(isPurgeAll ? 'Confirm Purge All' : `Confirm Purge ${count}`)
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_purge')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder()
    .addComponents(confirmButton, cancelButton);

  // Send confirmation message with buttons
  const response = await interaction.reply({
    content: isPurgeAll 
      ? '⚠️ Are you sure you want to delete **ALL** messages in this channel?'
      : `⚠️ Are you sure you want to delete the last **${count}** messages in this channel?`,
    components: [row],
    ephemeral: true
  });

  // Wait for button interaction
  try {
    const confirmation = await response.awaitMessageComponent({ 
      filter: i => i.user.id === interaction.user.id,
      time: 15000 
    });

    if (confirmation.customId === 'confirm_purge') {
      await confirmation.update({ 
        content: '🔄 Purging messages...', 
        components: [] 
      });

      let deleted = 0;
      
      if (isPurgeAll) {
        // Bulk delete all messages
        let lastId;
        while (true) {
          const messages = await interaction.channel.messages.fetch({ limit: 100, before: lastId });
          if (messages.size === 0) break;
          await interaction.channel.bulkDelete(messages, true);
          deleted += messages.size;
          lastId = messages.last()?.id;
          if (messages.size < 100) break;
        }
      } else {
        // Delete specific number of messages
        const messages = await interaction.channel.messages.fetch({ limit: count });
        if (messages.size > 0) {
          await interaction.channel.bulkDelete(messages, true);
          deleted = messages.size;
        }
      }
      
      await confirmation.editReply({ 
        content: `✅ Purged ${deleted} messages from this channel.`, 
        components: [] 
      });
    } else if (confirmation.customId === 'cancel_purge') {
      await confirmation.update({ 
        content: '❌ Purge cancelled.', 
        components: [] 
      });
    }
  } catch (error) {
    console.log(`[PURGE] Button interaction error:`, error.message);
    await interaction.editReply({ 
      content: '❌ Purge cancelled or not confirmed in time.', 
      components: [] 
    });
  }
}; 