import { SlashCommandBuilder } from 'discord.js';
import { getCnsTagStatus } from '../../database/db.js';

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
    const tagStatus = getCnsTagStatus(targetUser.id);
    
    let response = `**CNS Tag Status for ${targetUser.tag}**\n\n`;
    
    if (!tagStatus.hasTag) {
      response += `**Status:** ❌ Never had CNS tag\n`;
      return interaction.reply({ content: response, ephemeral: true });
    }
    
    response += `**Status:** ${tagStatus.currentlyEquipped ? '✅ Currently Equipped' : '❌ Currently Unequipped'}\n`;
    
    if (tagStatus.currentlyEquipped) {
      const equippedAt = new Date(tagStatus.firstEquippedAt * 1000);
      response += `**Equipped Since:** ${equippedAt.toLocaleString()}\n`;
      
      if (tagStatus.totalTimeEquipped > 0) {
        const hours = Math.floor(tagStatus.totalTimeEquipped / 3600);
        const minutes = Math.floor((tagStatus.totalTimeEquipped % 3600) / 60);
        response += `**Time Equipped:** ${hours}h ${minutes}m\n`;
      }
    } else {
      if (tagStatus.lastUnequippedAt) {
        const unequippedAt = new Date(tagStatus.lastUnequippedAt * 1000);
        response += `**Last Unequipped:** ${unequippedAt.toLocaleString()}\n`;
      }
    }
    
    return interaction.reply({ content: response, ephemeral: true });
    
  } catch (error) {
    console.error('Error in tagstatus command:', error);
    return interaction.reply({
      content: '❌ An error occurred while checking tag status.',
      ephemeral: true
    });
  }
}
