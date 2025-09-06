import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';
import { markUserActive, markUserLeftServer } from '../../repositories/usersAdminRepo.js';

export const data = {
  name: 'set-activity-status',
  description: 'Dev-only: Check and update user activity status in database',
  options: [
    {
      name: 'action',
      type: ApplicationCommandOptionType.String,
      description: 'Action to perform',
      required: true,
      choices: [
        { name: 'Show current status', value: 'status' },
        { name: 'Refresh activity status', value: 'set' }
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
        flags: 64
      });
      return;
    }

    const action = interaction.options.getString('action');
    
    await interaction.deferReply({ flags: 64 });

    if (action === 'status') {
      // Show current status
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
      
    } else if (action === 'set') {
      // Refresh activity status by checking each user
      const guild = interaction.guild;
      const { getAllUsers, markUserActive, markUserLeftServer } = await import('../../database/db.js');
      
      // Get all users from database
      const allUsers = getAllUsers();
      
      let activeCount = 0;
      let leftCount = 0;
      let errorCount = 0;
      
      for (const user of allUsers) {
        try {
          // Check if user is currently in the server
          const guildMember = guild.members.cache.get(user.user_id);
          
          if (guildMember) {
            // User is in server, mark as active
            markUserActive(user.user_id);
            activeCount++;
          } else {
            // User is not in server, mark as left
            markUserLeftServer(user.user_id);
            leftCount++;
          }
        } catch (error) {
          console.error(`Error processing user ${user.user_id}:`, error);
          errorCount++;
        }
      }
      
      const embed = new EmbedBuilder()
        .setTitle('🔄 Activity Status Refresh Complete')
        .setDescription(`Successfully updated activity status for all users.`)
        .setColor('#00ff00')
        .setTimestamp()
        .addFields(
          { name: '✅ Active Users', value: `${activeCount} users marked as active`, inline: true },
          { name: '🚪 Left Users', value: `${leftCount} users marked as left server`, inline: true }
        );
      
      if (errorCount > 0) {
        embed.addFields({
          name: '⚠️ Errors',
          value: `${errorCount} users had errors during processing.`
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
          flags: 64
        });
      } else {
        await interaction.reply({
          content: '❌ An error occurred while setting activity status.',
          flags: 64
        });
      }
    } catch (err) {
      console.error('Failed to send error reply:', err);
    }
  }
};
