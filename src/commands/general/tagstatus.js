import { SlashCommandBuilder } from 'discord.js';
import { getCnsTagStatus } from '../../database/db.js';
import { rolesConfig } from '../../config/configLoader.js';

export const data = new SlashCommandBuilder()
  .setName('tagstatus')
  .setDescription('Check the CNS tag status for a user')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('The user to check (defaults to yourself)')
      .setRequired(false)
  );

export const cooldown = 5;

export async function execute(interaction) {
  try {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    if (!targetUser) {
      const response = '❌ Please mention a user to check their tag status.';
      return interaction.reply({ content: response, flags: 64 });
    }

    // Check if the target user is a member of the guild
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    if (!targetMember) {
      const response = '❌ The mentioned user is not a member of this server.';
      return interaction.reply({ content: response, flags: 64 });
    }

    // Check if the target user has the CNS Official role
    const cnsOfficialRole = rolesConfig().cnsOfficialRole;
    const hasTag = targetMember.roles.cache.has(cnsOfficialRole);

    const response = hasTag 
      ? `✅ **${targetUser.username}** has the CNS server tag equipped.`
      : `❌ **${targetUser.username}** does not have the CNS server tag equipped.`;

    await interaction.reply({ content: response, flags: 64 });
    
  } catch (error) {
    console.error('Error in tagstatus command:', error);
    return interaction.reply({
      content: '❌ An error occurred while checking tag status.',
      flags: 64
    });
  }
}
