import { handleMessageXP } from '../features/leveling/levelingSystem.js';
import { rolesConfig } from '../config/configLoader.js';
import { logInviteBlock } from '../utils/botLogger.js';
import logger from '../utils/logger.js';
import { cacheMessage } from '../utils/messageCache.js';
import { isAdmin } from '../utils/permissions.js';

export const name = 'messageCreate';
export const execute = async (message) => {
  if (message.author?.bot) return;
  cacheMessage(message);

  // Ignore messages in DMs
  if (!message.guild) return;

  // Automod: Block Discord invite links
  const inviteRegex = /discord\.(gg|io|me|li|com\/invite)\/[a-zA-Z0-9-]+/i;
  if (inviteRegex.test(message.content)) {
    // Exempt admin roles
    const member = message.member;
    if (!member || !isAdmin(member)) {
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
        logger.error({ err }, 'Error deleting invite link message or sending warning');
      }
      return;
    }
  }

  try {
    // Award XP for message
    await handleMessageXP(message.member);
  } catch (error) {
    logger.error({ err: error }, 'Error handling message XP');
  }
}; 