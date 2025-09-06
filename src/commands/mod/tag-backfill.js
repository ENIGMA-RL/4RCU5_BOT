import { EmbedBuilder } from 'discord.js';
import { rolesConfig } from '../../config/configLoader.js';
import { isAdmin } from '../../utils/permissions.js';
import { syncExistingTagHoldersOnStartup } from '../../features/tagSync/tagSyncService.js';

export const data = {
	name: 'tag-backfill',
	description: 'Admin: Backfill tag equipped timestamps for current CNS tag holders',
	options: [],
	defaultMemberPermissions: null
};

export const execute = async (interaction) => {
	// Admin-only check
	const hasPermission = isAdmin(interaction.member);
	if (!hasPermission) {
		await interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
		return;
	}

	await interaction.deferReply({ flags: 64 });

	try {
		const result = await syncExistingTagHoldersOnStartup(interaction.guild, interaction.client);
		const embed = new EmbedBuilder()
			.setTitle('🏷️ Tag Backfill Complete')
			.setDescription(result.message || 'Completed tag backfill for current holders')
			.setColor('#00b3ff')
			.addFields(
				{ name: 'Total Holders', value: String(result.total || 0), inline: true },
				{ name: 'Synced', value: String(result.synced || 0), inline: true }
			)
			.setTimestamp();
		await interaction.editReply({ embeds: [embed] });
	} catch (error) {
		await interaction.editReply({ content: '❌ Failed to backfill tags. Check logs.' });
	}
};


