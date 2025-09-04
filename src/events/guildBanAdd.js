import { markUserLeftServer } from '../database/db.js';

export const once = false;

export const execute = async (ban) => {
	try {
		// ban.user is the User; ban.guild is the Guild
		const userId = ban.user?.id;
		if (!userId) return;
		markUserLeftServer(userId);
	} catch (error) {
		console.error('Error in guildBanAdd event:', error);
	}
};

