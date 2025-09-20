import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';
import { isAdmin } from '../../utils/permissions.js';
import { getAllUsers, markUserActive, markUserLeftServer } from '../../repositories/usersAdminRepo.js';
import { createUser, allowLeftReset, clearLeftReset } from '../../repositories/usersRepo.js';
import logger from '../../utils/logger.js';

export const data = {
	name: 'sync-active-members',
	description: 'Admin: Refresh activity status for all users based on guild membership',
	options: [],
	defaultMemberPermissions: null
};

export const execute = async (interaction) => {
	// Admin-only check
	const hasPermission = isAdmin(interaction.member);
	if (!hasPermission) {
		await interaction.reply({
			content: '❌ You do not have permission to use this command.',
			flags: 64
		});
		return;
	}

	await interaction.deferReply({ flags: 64 });

	try {
    const guild = interaction.guild;
    try { await guild.members.fetch(); } catch {}

    const allUsers = getAllUsers();
    const presentMemberIds = new Set(guild.members.cache.keys());

    let activeCount = 0;
    let leftCount = 0;
    let addedCount = 0;
    let errorCount = 0;

    // 1) Add any missing present members into DB and mark active
    for (const memberId of presentMemberIds) {
      try {
        // Upsert (INSERT OR IGNORE)
        const member = guild.members.cache.get(memberId);
        createUser(
          memberId,
          member?.user?.username ?? null,
          null,
          member?.user?.displayAvatarURL?.({ extension: 'png' }) ?? null
        );
        // Safely clear left flag if needed
        try { allowLeftReset(memberId); } catch {}
        try { markUserActive(memberId); activeCount++; } catch (e) { errorCount++; }
        try { clearLeftReset(memberId); } catch {}
        addedCount++;
      } catch (err) {
        // If already existed, addedCount might be overstated; adjust conservatively
        addedCount = Math.max(0, addedCount - 1);
      }
    }

    // 2) For every DB user, mark left if not present; otherwise ensure active
    for (const user of allUsers) {
      try {
        if (presentMemberIds.has(user.user_id)) {
          try { allowLeftReset(user.user_id); } catch {}
          markUserActive(user.user_id);
          try { clearLeftReset(user.user_id); } catch {}
          activeCount++;
        } else {
          markUserLeftServer(user.user_id);
          leftCount++;
        }
      } catch (error) {
        logger.error({ err: error, userId: user.user_id }, 'Error processing user');
        errorCount++;
      }
    }

		const embed = new EmbedBuilder()
			.setTitle('🔄 Activity Status Sync Complete')
			.setDescription('Refreshed activity status for all users based on current guild membership.')
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
	} catch (error) {
		logger.error({ err: error }, 'Error in sync-active-members command');
		try {
			await interaction.editReply({ content: '❌ An error occurred while syncing activity status.' });
		} catch {}
	}
};


