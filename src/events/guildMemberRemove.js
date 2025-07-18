import { EmbedBuilder } from 'discord.js';
import { updateStats } from '../features/stats/statsUpdater.js';
import { channelsConfig } from '../config/configLoader.js';

export const name = 'guildMemberRemove';
export const once = false;

export const execute = async (member) => {
  try {
    console.log(`👋 Member left: ${member.user.tag} (${member.id})`);
    
    // Update stats when a member leaves
    await updateStats(member.client, member.guild.id, channelsConfig().statsChannelId);
    
  } catch (error) {
    console.error('Error in guildMemberRemove event:', error);
  }
}; 