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
    const allDbUserIds = new Set(allUsers.map(u => u.user_id));
    const presentMemberIds = new Set(guild.members.cache.keys());

    let activeCount = 0;
    let leftCount = 0;
    let addedCount = 0;
    let errorCount = 0;

    // 1) Ensure every present member exists in DB and is marked active
    for (const memberId of presentMemberIds) {
      try {
        const member = guild.members.cache.get(memberId);
        const res = createUser(
          memberId,
          member?.user?.username ?? null,
          null,
          member?.user?.displayAvatarURL?.({ extension: 'png' }) ?? null
        );
        if (res && typeof res.changes === 'number' && res.changes > 0) {
          addedCount++;
        }
        try { allowLeftReset(memberId); } catch {}
        try { markUserActive(memberId); activeCount++; } catch { errorCount++; }
        try { clearLeftReset(memberId); } catch {}
      } catch (err) {
        errorCount++; 
      }
    }

    // 2) For every DB user, mark left if not present in guild
    for (const userId of allDbUserIds) {
      if (presentMemberIds.has(userId)) continue;
      try {
        markUserLeftServer(userId);
        leftCount++;
      } catch (error) {
        logger.error({ err: error, userId }, 'Error marking user left');
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

    // Optionally surface cache vs. server count to help diagnose missing Member Intent
    const cacheCount = presentMemberIds.size;
    const serverCount = guild.memberCount ?? cacheCount;
    if (serverCount && cacheCount !== serverCount) {
      embed.addFields({ name: 'ℹ️ Scanned vs Server Count', value: `${cacheCount} / ${serverCount}`, inline: true });
    }

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


