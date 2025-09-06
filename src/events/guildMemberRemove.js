import { EmbedBuilder } from 'discord.js';
import { updateStats } from '../features/stats/statsUpdater.js';
import { channelsConfig } from '../config/configLoader.js';
import { logMemberLeave } from '../utils/botLogger.js';
import { markUserLeft } from '../repositories/usersRepo.js';
import logger from '../utils/logger.js';

export const name = 'guildMemberRemove';
export const once = false;

export const execute = async (member) => {
  try {
    const username = member.user.username;
    const userTag = member.user.tag;
    
    logger.info(`👋 Member left: ${userTag} (${member.id})`);
    
    // Mark user as left server in database
    markUserLeft(member.id);
    
    await logMemberLeave(member.client, member.id, username);
    
    // Update stats when a member leaves
    await updateStats(member.client, member.guild.id, channelsConfig().statsChannelId);
    
  } catch (error) {
    logger.error({ err: error }, 'Error in guildMemberRemove event');
  }
}; 