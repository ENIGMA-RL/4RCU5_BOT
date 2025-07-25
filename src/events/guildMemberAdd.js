import { EmbedBuilder } from 'discord.js';
import { logAction } from '../features/logger/logger.js';
import { updateStats } from '../features/stats/statsUpdater.js';
import { channelsConfig, rolesConfig } from '../config/configLoader.js';
import { logMemberJoin, logRoleChange } from '../utils/botLogger.js';

export const name = 'guildMemberAdd';
export const once = false;

export const execute = async (member) => {
  try {
    console.log(`👋 New member joined: ${member.user.tag} (${member.id})`);
    
    // Log the action
    logAction(`New member joined: ${member.user.tag}`);
    
    // Log member join
    await logMemberJoin(member.client, member.id, member.user.tag);
    
    // Send welcome message to welcome channel
    const welcomeChannel = await member.guild.channels.fetch(channelsConfig().welcomeChannelId).catch(() => null);
    if (welcomeChannel && welcomeChannel.isTextBased()) {
      await welcomeChannel.send({ content: `${member} Joined CNS` });
    }
    
    // Assign CNS role to new member
    const CNS_ROLE_ID = rolesConfig().cnsRole;
    try {
      await member.roles.add(CNS_ROLE_ID, 'New member CNS role');
      console.log(`✅ Assigned CNS role to ${member.user.tag}`);
      
      // Log the role assignment
      const cnsRole = member.guild.roles.cache.get(CNS_ROLE_ID);
      if (cnsRole) {
        await logRoleChange(member.client, member.id, member.user.tag, 'Assigned', cnsRole.name, 'New member CNS role');
      }
    } catch (error) {
      console.error(`❌ Error assigning CNS role to ${member.user.tag}:`, error);
    }
    
    // Update stats when a member joins
    await updateStats(member.client, member.guild.id, channelsConfig().statsChannelId);
    
  } catch (error) {
    console.error('Error in guildMemberAdd event:', error);
  }
}; 