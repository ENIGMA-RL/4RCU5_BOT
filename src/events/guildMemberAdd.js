import { EmbedBuilder } from 'discord.js';
import { logAction } from '../features/logger/logger.js';
import { updateStats } from '../features/stats/statsUpdater.js';
import channelsConfig from '../config/channels.json' with { type: 'json' };
import rolesConfig from '../config/roles.json' with { type: 'json' };

export const name = 'guildMemberAdd';
export const once = false;

export const execute = async (member) => {
  try {
    console.log(`👋 New member joined: ${member.user.tag} (${member.id})`);
    
    // Log the action
    logAction(`New member joined: ${member.user.tag}`);
    
    // Send welcome message to log channel
    const logChannel = await member.guild.channels.fetch(channelsConfig.logChannelId).catch(() => null);
    if (logChannel && logChannel.isTextBased()) {
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('👋 Welcome to CNS!')
        .setDescription(`**${member.user.tag}** (${member.id}) has joined the server!`)
        .setColor('#00ff00')
        .setTimestamp()
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
      
      await logChannel.send({ embeds: [welcomeEmbed] });
    }
    
    // Assign default role if configured
    if (rolesConfig.defaultRole) {
      try {
        await member.roles.add(rolesConfig.defaultRole, 'New member default role');
        console.log(`✅ Assigned default role to ${member.user.tag}`);
      } catch (error) {
        console.error(`❌ Error assigning default role to ${member.user.tag}:`, error);
      }
    }
    
    // Update stats when a member joins
    await updateStats(member.client, member.guild.id, channelsConfig.statsChannelId);
    
  } catch (error) {
    console.error('Error in guildMemberAdd event:', error);
  }
}; 