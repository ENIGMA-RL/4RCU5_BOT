import { EmbedBuilder } from 'discord.js';
import { updateStats } from '../features/stats/statsUpdater.js';
import { channelsConfig, rolesConfig } from '../config/configLoader.js';
import { logMemberJoin, logRoleChange } from '../utils/botLogger.js';
import { markUserActive, allowLeftReset, clearLeftReset } from '../repositories/usersRepo.js';
import logger from '../utils/logger.js';

export const name = 'guildMemberAdd';
export const once = false;

export const execute = async (member) => {
  try {
    logger.info(`New member joined: ${member.user.tag} (${member.id})`);
    
    // Safely allow left_server reset for this join and update flags
    try {
      allowLeftReset(member.id);
      markUserActive(
        member.id,
        member.user?.username ?? null,
        member.user?.displayAvatarURL?.({ extension: 'png' }) ?? null
      );
    } catch (e) {
      logger.error({ err: e }, 'Failed to mark user active on join');
    } finally {
      try { clearLeftReset(member.id); } catch {}
    }
    
    // Centralized logging
    logger.info({ user: member.user.tag, userId: member.id }, 'Member joined');
    
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
      logger.info(`Assigned CNS role to ${member.user.tag}`);
      
      // Log the role assignment
      const cnsRole = member.guild.roles.cache.get(CNS_ROLE_ID);
      if (cnsRole) {
        await logRoleChange(member.client, member.id, member.user.tag, 'Assigned', cnsRole.name, 'New member CNS role');
      }
    } catch (error) {
      logger.error({ err: error }, `Error assigning CNS role to ${member.user.tag}`);
    }
    
    // Update stats when a member joins
    await updateStats(member.client, member.guild.id, channelsConfig().statsChannelId);
    
  } catch (error) {
    logger.error({ err: error }, 'Error in guildMemberAdd event');
  }
}; 