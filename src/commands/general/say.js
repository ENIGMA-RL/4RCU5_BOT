import { rolesConfig } from '../../config/configLoader.js';
import { isAdmin } from '../../utils/permissions.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export const data = {
  name: 'say',
  description: 'Make the bot say something! (Admin only)',
  options: [
    {
      name: 'message',
      type: 3,
      description: 'The message to say (start with + for multi-line modal)',
      required: true,
    },
    {
      name: 'messageid',
      type: 3,
      description: 'Message ID or link to reply to (optional)',
      required: false,
    },
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  const canAdmin = isAdmin(interaction.member);

  if (!canAdmin) {
    return interaction.reply({
      content: '🚫 You need admin permissions to use this command.',
      flags: 64,
    });
  }

  let message = interaction.options.getString('message');
  const messageId = interaction.options.getString('messageid') || '';

  // Check if message starts with + to open modal
  if (message.startsWith('+')) {
    // Remove the + prefix for the modal (or empty string if just "+")
    const modalText = message === '+' ? '' : message.substring(1);
    
    const modal = new ModalBuilder()
      .setCustomId(`sayModal|${messageId}`)
      .setTitle('Say Message');

    const textInput = new TextInputBuilder()
      .setCustomId('messageText')
      .setLabel('Your message')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(modalText)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(textInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
    return;
  }

  // Normal behavior - send immediately
  message = message.replace(/\\n/g, '\n');

  const raw = messageId;
  const linkMatch = raw.match(/channels\/\d+\/(\d{17,20})\/(\d{17,20})/);
  const id = linkMatch ? linkMatch[2] : (raw.match(/\d{17,20}$/)?.[0] ?? null);

  if (id) {
    try {
      const m = await interaction.channel.messages.fetch(id);
      await m.reply(message);
      return interaction.reply({ content: '✅ message sent as reply', flags: 64 });
    } catch {
      return interaction.reply({ content: '❌ invalid message id or link', flags: 64 });
    }
  }

  await interaction.channel.send(message);
  await interaction.reply({ content: '✅ message sent', flags: 64 });
}; 