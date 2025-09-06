import { markUserLeftServer } from '../repositories/usersAdminRepo.js';
import logger from '../utils/logger.js';

export const once = false;

export const execute = async (ban) => {
	try {
		// ban.user is the User; ban.guild is the Guild
		const userId = ban.user?.id;
		if (!userId) return;
		markUserLeftServer(userId);
	} catch (error) {
		logger.error({ err: error }, 'Error in guildBanAdd event');
	}
};

