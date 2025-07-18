import { rolesConfig } from '../../config/configLoader.js';

export const data = {
  name: 'say',
  description: 'Make the bot say something! (Admin only)',
  options: [
    {
      name: 'message',
      type: 3,
      description: 'The message to say',
      required: true,
    },
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  const memberRoles = interaction.member.roles.cache;
  const isAdmin = rolesConfig().adminRoles.some(roleId => memberRoles.has(roleId));

  if (!isAdmin) {
    return interaction.reply({
      content: '🚫 You need admin permissions to use this command.',
      flags: 64,
    });
  }

  let message = interaction.options.getString('message');
  message = message.replace(/\\n/g, '\n');

  await interaction.channel.send(message);

  await interaction.reply({
    content: '✅ Message sent!',
    flags: 64,
  });
}; 