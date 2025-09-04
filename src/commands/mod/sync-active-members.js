import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';
import { getAllUsers, markUserActive, markUserLeftServer } from '../../database/db.js';

export const data = {
	name: 'sync-active-members',
	description: 'Admin: Refresh activity status for all users based on guild membership',
	options: [],
	defaultMemberPermissions: null
};

export const execute = async (interaction) => {
	// Admin-only check
	const adminRoles = rolesConfig().adminRoles;
	const hasPermission = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
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
		const allUsers = getAllUsers();
		let activeCount = 0;
		let leftCount = 0;
		let errorCount = 0;

		for (const user of allUsers) {
			try {
				const guildMember = guild.members.cache.get(user.user_id);
				if (guildMember) {
					markUserActive(user.user_id);
					activeCount++;
				} else {
					markUserLeftServer(user.user_id);
					leftCount++;
				}
			} catch (error) {
				console.error(`Error processing user ${user.user_id}:`, error);
				errorCount++;
			}
		}

		const embed = new EmbedBuilder()
			.setTitle('🔄 Activity Status Sync Complete')
			.setDescription('Refreshed activity status for all users based on current guild membership.')
			.setColor('#00ff00')
			.setTimestamp()
			.addFields(
				{ name: '✅ Active Users', value: `${activeCount}`, inline: true },
				{ name: '🚪 Marked Left', value: `${leftCount}`, inline: true }
			);

		if (errorCount > 0) {
			embed.addFields({ name: '⚠️ Errors', value: `${errorCount}` });
		}

		await interaction.editReply({ embeds: [embed] });
	} catch (error) {
		console.error('Error in sync-active-members command:', error);
		try {
			await interaction.editReply({ content: '❌ An error occurred while syncing activity status.' });
		} catch {}
	}
};


