import {
  ApplicationCommandType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';

export const data = {
  name: 'reply as bot',
  type: ApplicationCommandType.Message
};

export const execute = async (interaction) => {
  const memberRoles = interaction.member.roles.cache;
  const isAdmin = rolesConfig().adminRoles.some(id => memberRoles.has(id));
  if (!isAdmin) return interaction.reply({ content: '🚫 admin only', flags: 64 });

  const targetId = interaction.targetId;

  const modal = new ModalBuilder()
    .setCustomId(`replyAsBot|${targetId}`)
    .setTitle('reply as bot');

  const msg = new TextInputBuilder()
    .setCustomId('replyText')
    .setLabel('your message')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(msg);
  modal.addComponents(row);

  await interaction.showModal(modal);
}; 