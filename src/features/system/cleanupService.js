import { cleanupDeletedUsers } from '../../repositories/usersAdminRepo.js';
import logger from '../../utils/logger.js';

class CleanupService {
  constructor(client) {
    this.client = client;
    this.cleanupInterval = null;
    this.isRunning = false;
  }

  start() {
    logger.info('Starting cleanup service...');
    
    // Run cleanup immediately
    this.runCleanup();
    
    // Schedule daily cleanup (every 24 hours)
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
    
    logger.info('Cleanup service started - will run daily');
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Cleanup service stopped');
    }
  }

  async runCleanup() {
    if (this.isRunning) {
      logger.debug('Cleanup already running, skipping...');
      return;
    }

    this.isRunning = true;
    logger.info('Running scheduled cleanup...');
    
    try {
      const result = await cleanupDeletedUsers(this.client);
      logger.info(`Scheduled cleanup completed: ${result.deletedCount} deleted users removed, ${result.leftServerCount} users marked as left server`);
    } catch (error) {
      logger.error({ err: error }, 'Error during scheduled cleanup');
    } finally {
      this.isRunning = false;
    }
  }

  // Manual cleanup trigger
  async triggerCleanup() {
    logger.info('Manual cleanup triggered...');
    await this.runCleanup();
  }
}

export default CleanupService;
