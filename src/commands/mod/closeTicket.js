import { rolesConfig } from '../../config/configLoader.js';
import { TicketManager } from '../../features/tickets/ticketManager.js';

export const data = {
  name: 'closeticket',
  description: 'Close a support ticket (Mod+)',
  options: [
    {
      name: 'channel',
      type: 7, // Channel type
      description: 'The ticket channel to close',
      required: true,
      channel_types: [0], // Text channels only
    },
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  const memberRoles = interaction.member.roles.cache;
  const isMod = rolesConfig().modRoles?.some(roleId => memberRoles.has(roleId)) || false;
  const isAdmin = rolesConfig().adminRoles.some(roleId => memberRoles.has(roleId));

  if (!isMod && !isAdmin) {
    return interaction.reply({
      content: '🚫 You need mod permissions or higher to use this command.',
      flags: 64,
    });
  }

  const channel = interaction.options.getChannel('channel');
  
  if (!channel) {
    return interaction.reply({
      content: '❌ Invalid channel specified.',
      flags: 64,
    });
  }

  const ticketManager = new TicketManager(interaction.client);
  const result = await ticketManager.closeTicket(interaction, channel.id);

  if (result.success) {
    await interaction.reply({
      content: result.message,
      flags: 64,
    });
  } else {
    await interaction.reply({
      content: `❌ ${result.error}`,
      flags: 64,
    });
  }
}; 