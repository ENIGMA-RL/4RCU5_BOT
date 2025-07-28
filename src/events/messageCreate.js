import levelingService from '../services/LevelingService.js';
import { rolesConfig } from '../config/configLoader.js';
import { logInviteBlock } from '../utils/botLogger.js';
import { log } from '../utils/logger.js';
import featureManager from '../services/FeatureManager.js';

export const name = 'messageCreate';
export const execute = async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Ignore messages in DMs
  if (!message.guild) return;

  // Automod: Block Discord invite links
  if (featureManager.isFeatureEnabled('automod')) {
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
          log.error('Error deleting invite link message or sending warning', err, {
            userId: message.author.id,
            channelId: message.channel.id
          });
        }
        return;
      }
    }
  }

  // Award XP for message if leveling is enabled
  if (featureManager.isFeatureEnabled('leveling')) {
    try {
      await levelingService.awardMessageXP(message.member);
    } catch (error) {
      log.error('Error handling message XP', error, {
        userId: message.author.id,
        channelId: message.channel.id
      });
    }
  }
}; 