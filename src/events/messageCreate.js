import { handleMessageXP } from '../features/leveling/levelingSystem.js';

export const name = 'messageCreate';
export const execute = async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Ignore messages in DMs
  if (!message.guild) return;

  // Automod: Block Discord invite links
  const inviteRegex = /discord\.(gg|io|me|li|com\/invite)\/[a-zA-Z0-9-]+/i;
  if (inviteRegex.test(message.content)) {
    try {
      await message.delete();
      await message.author.send('Your message was deleted because posting Discord invite links is not allowed in this server.');
    } catch (err) {
      console.error('Error deleting invite link message or sending DM:', err);
    }
    return;
  }

  try {
    // Award XP for message
    await handleMessageXP(message.member);
  } catch (error) {
    console.error('Error handling message XP:', error);
  }
}; 