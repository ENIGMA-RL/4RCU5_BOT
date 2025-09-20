import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';
import db from '../../database/connection.js';
import { getAllUsers, markUserActive, markUserLeftServer } from '../../repositories/usersAdminRepo.js';
import { allowLeftReset, clearLeftReset, createUser } from '../../repositories/usersRepo.js';

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
      const leftUsers = db
        .prepare("SELECT user_id, username FROM users WHERE COALESCE(left_server,0)=1")
        .all();
      
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
      const guild = interaction.guild;
      try { await guild.members.fetch(); } catch {}

      const allUsers = getAllUsers();
      const presentIds = new Set(guild.members.cache.keys());

      let activeCount = 0;
      let leftCount = 0;
      let addedCount = 0;
      let errorCount = 0;

      for (const memberId of presentIds) {
        try {
          const m = guild.members.cache.get(memberId);
          createUser(memberId, m?.user?.username ?? null, null, m?.user?.displayAvatarURL?.({ extension: 'png' }) ?? null);
          try { allowLeftReset(memberId); } catch {}
          try { markUserActive(memberId); activeCount++; } catch { errorCount++; }
          try { clearLeftReset(memberId); } catch {}
          addedCount++;
        } catch {
          addedCount = Math.max(0, addedCount - 1);
        }
      }

      for (const user of allUsers) {
        try {
          if (presentIds.has(user.user_id)) {
            try { allowLeftReset(user.user_id); } catch {}
            markUserActive(user.user_id);
            try { clearLeftReset(user.user_id); } catch {}
            activeCount++;
          } else {
            markUserLeftServer(user.user_id);
            leftCount++;
          }
        } catch (error) {
          errorCount++;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🔄 Activity Status Refresh Complete')
        .setDescription('Successfully updated activity status for all users.')
        .setColor('#00ff00')
        .setTimestamp()
        .addFields(
          { name: '✅ Marked Active', value: `${activeCount}`, inline: true },
          { name: '🚪 Marked Left', value: `${leftCount}`, inline: true },
          { name: '➕ Added Missing', value: `${addedCount}`, inline: true }
        );

      if (errorCount > 0) {
        embed.addFields({ name: '⚠️ Errors', value: `${errorCount}` });
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
