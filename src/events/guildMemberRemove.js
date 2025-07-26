import { EmbedBuilder } from 'discord.js';
import { updateStats } from '../features/stats/statsUpdater.js';
import { channelsConfig } from '../config/configLoader.js';
import { logMemberLeave } from '../utils/botLogger.js';

export const name = 'guildMemberRemove';
export const once = false;

export const execute = async (member) => {
  try {
    // Capture username before user becomes unavailable
    const username = member.user.username;
    const userTag = member.user.tag;
    
    console.log(`👋 Member left: ${userTag} (${member.id})`);
    
    // Log member leave with username instead of mention
    await logMemberLeave(member.client, member.id, username);
    
    // Update stats when a member leaves
    await updateStats(member.client, member.guild.id, channelsConfig().statsChannelId);
    
  } catch (error) {
    console.error('Error in guildMemberRemove event:', error);
  }
}; 