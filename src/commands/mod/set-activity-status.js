import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';
import { markUserActive, markUserLeftServer } from '../../database/db.js';

export const data = {
  name: 'set-activity-status',
  description: 'Dev-only: Set initial activity status for all users in database',
  options: [
    {
      name: 'action',
      type: ApplicationCommandOptionType.String,
      description: 'Action to perform',
      required: true,
      choices: [
        { name: 'Mark all current members as active', value: 'mark-active' },
        { name: 'Mark all users as left (reset)', value: 'mark-left' },
        { name: 'Check current status', value: 'check' }
      ]
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    // Dev-only check
    const devRoleId = rolesConfig().cnsDeveloperRole;
    if (!interaction.member.roles.cache.has(devRoleId)) {
      await interaction.reply({
        content: '❌ Only users with the CNS Developer role can use this command.',
        ephemeral: true
      });
      return;
    }

    const action = interaction.options.getString('action');
    
    await interaction.deferReply({ ephemeral: true });

    if (action === 'mark-active') {
      // Mark all current guild members as active
      const guild = interaction.guild;
      const members = guild.members.cache;
      
      let activeCount = 0;
      let errorCount = 0;
      
      for (const [userId, member] of members) {
        try {
          markUserActive(userId);
          activeCount++;
        } catch (error) {
          console.error(`Error marking user ${userId} as active:`, error);
          errorCount++;
        }
      }
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Activity Status Update Complete')
        .setDescription(`Successfully marked **${activeCount}** current guild members as active.`)
        .setColor('#00ff00')
        .setTimestamp();
      
      if (errorCount > 0) {
        embed.addFields({
          name: '⚠️ Errors',
          value: `${errorCount} users had errors during processing.`
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
      
    } else if (action === 'mark-left') {
      // Mark all users as left (reset)
      const { markAllUsersAsLeft } = await import('../../database/db.js');
      
      if (typeof markAllUsersAsLeft === 'function') {
        const result = markAllUsersAsLeft();
        
        const embed = new EmbedBuilder()
          .setTitle('🔄 Activity Status Reset Complete')
          .setDescription(`Successfully marked all users as left server.`)
          .setColor('#ffaa00')
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: '❌ Function not available. You may need to add it to the database module.',
          ephemeral: true
        });
      }
      
    } else if (action === 'check') {
      // Check current status
      const { getUsersWhoLeftServer } = await import('../../database/db.js');
      const leftUsers = getUsersWhoLeftServer();
      
      const embed = new EmbedBuilder()
        .setTitle('📊 Current Activity Status')
        .setDescription(`Found **${leftUsers.length}** users marked as left server.`)
        .setColor('#0099ff')
        .setTimestamp();
      
      if (leftUsers.length > 0) {
        const leftUserList = leftUsers.slice(0, 10).map(u => `• ${u.username || 'Unknown'} (${u.user_id})`).join('\n');
        embed.addFields({
          name: 'Users Marked as Left (first 10)',
          value: leftUserList + (leftUsers.length > 10 ? '\n... and more' : '')
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
    }
    
  } catch (error) {
    console.error('Error in set-activity-status command:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ An error occurred while setting activity status.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '❌ An error occurred while setting activity status.',
          ephemeral: true
        });
      }
    } catch (err) {
      console.error('Failed to send error reply:', err);
    }
  }
};
