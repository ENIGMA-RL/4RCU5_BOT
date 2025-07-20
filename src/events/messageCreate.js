import { handleMessageXP } from '../features/leveling/levelingSystem.js';
import { rolesConfig } from '../config/configLoader.js';
import { logInviteBlock } from '../utils/botLogger.js';

export const name = 'messageCreate';
export const execute = async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Ignore messages in DMs
  if (!message.guild) return;

  // Automod: Block Discord invite links
  const inviteRegex = /discord\.(gg|io|me|li|com\/invite)\/[a-zA-Z0-9-]+/i;
  if (inviteRegex.test(message.content)) {
    // Exempt admin roles
    const adminRoles = rolesConfig().adminRoles;
    const member = message.member;
    if (!member || !member.roles.cache.some(role => adminRoles.includes(role.id))) {
      try {
        await message.delete();
        // Warn in channel and tag the user
        await message.channel.send({
          content: `🚫 <@${message.author.id}>, posting Discord invite links is not allowed! Your message has been removed.`
        });
        // Optionally DM the user as well
        await message.author.send('Your message was deleted because posting Discord invite links is not allowed in this server.');
        
        // Log the action
        await logInviteBlock(message.client, message.author.id, message.author.tag, message.channel.name);
      } catch (err) {
        console.error('Error deleting invite link message or sending warning:', err);
      }
      return;
    }
  }

  try {
    // Award XP for message
    await handleMessageXP(message.member);
  } catch (error) {
    console.error('Error handling message XP:', error);
  }
}; 