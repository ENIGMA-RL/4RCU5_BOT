import { cleanupDeletedUsers } from '../../database/db.js';

class CleanupService {
  constructor(client) {
    this.client = client;
    this.cleanupInterval = null;
    this.isRunning = false;
  }

  start() {
    console.log('🚀 Starting cleanup service...');
    
    // Run cleanup immediately
    this.runCleanup();
    
    // Schedule daily cleanup (every 24 hours)
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
    
    console.log('✅ Cleanup service started - will run daily');
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('🛑 Cleanup service stopped');
    }
  }

  async runCleanup() {
    if (this.isRunning) {
      console.log('⚠️ Cleanup already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('🧹 Running scheduled cleanup...');
    
    try {
      const result = await cleanupDeletedUsers(this.client);
      console.log(`✅ Scheduled cleanup completed: ${result.deletedCount} deleted users removed, ${result.leftServerCount} users marked as left server`);
    } catch (error) {
      console.error('❌ Error during scheduled cleanup:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Manual cleanup trigger
  async triggerCleanup() {
    console.log('🔧 Manual cleanup triggered...');
    await this.runCleanup();
  }
}

export default CleanupService;
