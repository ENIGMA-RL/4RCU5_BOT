import { handleMessageXP } from '../features/leveling/levelingSystem.js';

export const name = 'messageCreate';
export const execute = async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Ignore messages in DMs
  if (!message.guild) return;

  try {
    // Award XP for message
    await handleMessageXP(message.member);
  } catch (error) {
    console.error('Error handling message XP:', error);
  }
}; 