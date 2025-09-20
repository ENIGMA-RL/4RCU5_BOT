import db from './connection.js';
import logger from '../utils/logger.js';

// Initialize database tables
function initializeDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      discriminator TEXT,
      avatar TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      last_seen INTEGER,
      message_count INTEGER DEFAULT 0,
      voice_time INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      voice_xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      voice_level INTEGER DEFAULT 0,
      total_level INTEGER DEFAULT 0,
      last_message_time INTEGER,
      last_voice_time INTEGER,
      level_up_notifications BOOLEAN DEFAULT 0,
      left_server BOOLEAN DEFAULT 0,
      cns_tag_equipped_at INTEGER,
      cns_tag_unequipped_at INTEGER
    )
  `);

  // Lightweight migration: ensure columns exist in legacy databases
  try {
    const columns = db.prepare("PRAGMA table_info('users')").all();
    const names = new Set(columns.map(c => c.name));
    if (!names.has('message_count')) {
      db.exec("ALTER TABLE users ADD COLUMN message_count INTEGER DEFAULT 0");
    }
    if (!names.has('voice_time')) {
      db.exec("ALTER TABLE users ADD COLUMN voice_time INTEGER DEFAULT 0");
    }
    if (!names.has('discriminator')) {
      db.exec("ALTER TABLE users ADD COLUMN discriminator TEXT");
    }
    if (!names.has('avatar')) {
      db.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
    }
    if (!names.has('left_server')) {
      db.exec("ALTER TABLE users ADD COLUMN left_server BOOLEAN DEFAULT 0");
    }
  } catch (e) {
    logger.warn('Warning applying users table migrations:', e.message);
  }

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_level ON users(level);
    CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp);
    CREATE INDEX IF NOT EXISTS idx_users_message_count ON users(message_count);
    CREATE INDEX IF NOT EXISTS idx_users_voice_time ON users(voice_time);
    CREATE INDEX IF NOT EXISTS idx_users_cns_tag_equipped ON users(cns_tag_equipped_at);
    CREATE INDEX IF NOT EXISTS idx_users_cns_tag_unequipped ON users(cns_tag_unequipped_at);
  `);

  // Whitelist table and trigger to block unintended left_server resets
  db.exec(`
    CREATE TABLE IF NOT EXISTS allow_left_reset (
      user_id TEXT PRIMARY KEY
    );

    CREATE TRIGGER IF NOT EXISTS users_block_left_reset
    BEFORE UPDATE OF left_server ON users
    WHEN OLD.left_server = 1 AND NEW.left_server = 0
      AND NOT EXISTS (SELECT 1 FROM allow_left_reset WHERE user_id = NEW.user_id)
    BEGIN
      SELECT RAISE(ABORT, 'blocked reset of left_server');
    END;
  `);

  // Birthdays table for birthday tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS birthdays (
      user_id TEXT,
      guild_id TEXT,
      username TEXT,
      birth_day INTEGER NOT NULL,
      birth_month INTEGER NOT NULL,
      birth_year INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // CNS tag tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cns_tag_tracking (
      user_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      equipped_at INTEGER,
      unequipped_at INTEGER,
      total_time_equipped INTEGER DEFAULT 0,
      last_updated INTEGER NOT NULL
    )
  `);

  // Create indexes for cns_tag_tracking table
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cns_tag_tracking_guild ON cns_tag_tracking(guild_id);
    CREATE INDEX IF NOT EXISTS idx_cns_tag_tracking_equipped ON cns_tag_tracking(equipped_at);
    CREATE INDEX IF NOT EXISTS idx_cns_tag_tracking_unequipped ON cns_tag_tracking(unequipped_at);
  `);

  // Voice channel tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_channels (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      owner_id TEXT,
      created_at INTEGER NOT NULL,
      is_locked INTEGER DEFAULT 0,
      user_limit INTEGER DEFAULT 0,
      name TEXT
    )
  `);

  // Voice channel permissions
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_channel_permissions (
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      permission_type TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      PRIMARY KEY (channel_id, user_id, permission_type)
    )
  `);

  // New simplified giveaway tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT,
      end_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open','closed','drawn_unpublished','published')),
      pending_winner_user_id TEXT,
      published_winner_user_id TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // In-place migrations for legacy giveaway tables: add missing columns safely
  try {
    const gvCols = db.prepare("PRAGMA table_info('giveaways')").all();
    const gvNames = new Set(gvCols.map(c => c.name));
    if (!gvNames.has('guild_id')) {
      db.exec("ALTER TABLE giveaways ADD COLUMN guild_id TEXT");
    }
    if (!gvNames.has('channel_id')) {
      db.exec("ALTER TABLE giveaways ADD COLUMN channel_id TEXT");
    }
    if (!gvNames.has('message_id')) {
      db.exec("ALTER TABLE giveaways ADD COLUMN message_id TEXT");
    }
    if (!gvNames.has('description')) {
      db.exec("ALTER TABLE giveaways ADD COLUMN description TEXT");
    }
    if (!gvNames.has('image_url')) {
      db.exec("ALTER TABLE giveaways ADD COLUMN image_url TEXT");
    }
    if (!gvNames.has('end_at')) {
      db.exec("ALTER TABLE giveaways ADD COLUMN end_at INTEGER");
    }
    if (!gvNames.has('status')) {
      db.exec("ALTER TABLE giveaways ADD COLUMN status TEXT DEFAULT 'open'");
    }
    if (!gvNames.has('pending_winner_user_id')) {
      db.exec("ALTER TABLE giveaways ADD COLUMN pending_winner_user_id TEXT");
    }
    if (!gvNames.has('published_winner_user_id')) {
      db.exec("ALTER TABLE giveaways ADD COLUMN published_winner_user_id TEXT");
    }
    if (!gvNames.has('created_by')) {
      db.exec("ALTER TABLE giveaways ADD COLUMN created_by TEXT");
    }
    if (!gvNames.has('created_at')) {
      db.exec("ALTER TABLE giveaways ADD COLUMN created_at INTEGER");
    }
  } catch (e) {
    logger.warn('Warning applying giveaways table migrations:', e.message);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS giveaway_entries (
      giveaway_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tickets INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      withdrawn_at INTEGER,
      PRIMARY KEY (giveaway_id, user_id),
      FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
    )
  `);

  // Role tenure to enforce 30 days for the tag
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_tenure (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, role_id)
    )
  `);

  // Music tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_music_state (
      guild_id TEXT PRIMARY KEY,
      volume INTEGER DEFAULT 100,
      loop_mode TEXT DEFAULT 'off',
      autoplay INTEGER DEFAULT 0,
      idle_timeout_sec INTEGER DEFAULT 300,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE TABLE IF NOT EXISTS guild_queue (
      guild_id TEXT,
      position INTEGER,
      title TEXT,
      url TEXT,
      source TEXT,
      duration_ms INTEGER,
      requested_by_id TEXT,
      thumb TEXT,
      added_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY(guild_id, position)
    );
    
    CREATE TABLE IF NOT EXISTS guild_resume_state (
      guild_id TEXT PRIMARY KEY,
      track_url TEXT,
      track_position_ms INTEGER,
      voice_channel_id TEXT,
      text_channel_id TEXT,
      saved_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_gv_status ON giveaways(status);
    CREATE INDEX IF NOT EXISTS idx_gve_gv ON giveaway_entries(giveaway_id);
    CREATE INDEX IF NOT EXISTS idx_guild_queue_guild ON guild_queue(guild_id);
    CREATE INDEX IF NOT EXISTS idx_guild_queue_position ON guild_queue(guild_id, position);
  `);

  logger.info('✅ Database initialized successfully');
}

// Initialize database on import
initializeDatabase();

// User management functions
// Note: operational helpers have moved to repositories; this module now only initializes schema

// CNS tag tracking functions
// Tag tracking helpers moved to repositories

// Voice channel functions
// Voice channel helpers moved to repositories

// Voice channel permission functions
// Voice channel permission helpers moved to repositories

// Clean giveaway database functions
// Giveaway helpers moved to repositories

// Role tenure
// Role tenure helpers moved to repositories

// Cleanup and utility functions
// Cleanup helpers moved to repositories

export default db;

// Leveling system functions
export function calculateLevel(xp, thresholds) {
  if (!thresholds || thresholds.length === 0) return 1;
  
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) {
      return i + 1;
    }
  }
  return 1;
}

export function getXPForNextLevel(currentLevel, thresholds) {
  if (!thresholds || currentLevel >= thresholds.length) return 0;
  return thresholds[currentLevel] || 0;
}

export function getCurrentLevelXP(currentLevel, thresholds) {
  if (!thresholds || currentLevel <= 1) return 0;
  return thresholds[currentLevel - 2] || 0;
}

// CNS tag status functions for other services
export function isCnsTagCurrentlyEquipped(userId) {
  const user = getUser(userId);
  return user && user.cns_tag_equipped_at && !user.cns_tag_unequipped_at;
}

// Enhanced version that accepts guildId for proper tracking
export function setCnsTagEquippedWithGuild(userId, guildId) {
  logger.debug(`🔧 [DEBUG] setCnsTagEquippedWithGuild called for user ${userId} in guild ${guildId}`);
  const now = Math.floor(Date.now() / 1000);
  
  // Update users table - only set equipped_at, don't clear unequipped_at
  const userStmt = db.prepare(`
    UPDATE users 
    SET cns_tag_equipped_at = ?
    WHERE user_id = ?
  `);
  const userResult = userStmt.run(now, userId);
  logger.debug(`🔧 [DEBUG] Users table update result:`, userResult);
  
  // Also update the tracking table
  try {
    // Check if tracking record exists
    const existing = getCnsTagStatus(userId);
    logger.debug(`🔧 [DEBUG] Existing tracking record:`, existing);
    if (existing) {
      // Update existing record
      const trackingResult = updateCnsTagTracking(userId, now, existing.unequipped_at, existing.total_time_equipped || 0);
      logger.debug(`🔧 [DEBUG] Tracking table update result:`, trackingResult);
    } else {
      // Create new tracking record
      const createResult = createCnsTagTracking(userId, guildId);
      logger.debug(`🔧 [DEBUG] Created new tracking record:`, createResult);
    }
  } catch (error) {
    logger.error(`❌ Error updating CNS tag tracking for user ${userId}:`, error);
  }
  
  return userResult;
}

// Enhanced version that accepts guildId for proper tracking
export function setCnsTagUnequippedWithGuild(userId, guildId) {
  logger.debug(`🔧 [DEBUG] setCnsTagUnequippedWithGuild called for user ${userId} in guild ${guildId}`);
  const now = Math.floor(Date.now() / 1000);
  
  // Update users table
  const userStmt = db.prepare(`
    UPDATE users 
    SET cns_tag_unequipped_at = ?
    WHERE user_id = ?
  `);
  const userResult = userStmt.run(now, userId);
  logger.debug(`🔧 [DEBUG] Users table update result:`, userResult);
  
  // Also update the tracking table
  try {
    const existing = getCnsTagStatus(userId);
    logger.debug(`🔧 [DEBUG] Existing tracking record:`, existing);
    if (existing && existing.equipped_at) {
      // Calculate total time equipped
      const equippedTime = now - existing.equipped_at;
      const totalTime = (existing.total_time_equipped || 0) + equippedTime;
      
      const trackingResult = updateCnsTagTracking(userId, existing.equipped_at, now, totalTime);
      logger.debug(`🔧 [DEBUG] Tracking table update result:`, trackingResult);
    }
  } catch (error) {
    logger.error(`❌ Error updating CNS tag tracking for user ${userId}:`, error);
  }
  
  return userResult;
}

// Backward compatibility functions (these will be deprecated)
export function setCnsTagEquipped(userId) {
  // For backward compatibility, try to get guild ID from existing tracking
  const existing = getCnsTagStatus(userId);
  const guildId = existing?.guild_id || 'unknown';
  return setCnsTagEquippedWithGuild(userId, guildId);
}

export function setCnsTagUnequipped(userId) {
  // For backward compatibility, try to get guild ID from existing tracking
  const existing = getCnsTagStatus(userId);
  const guildId = existing?.guild_id || 'unknown';
  return setCnsTagUnequippedWithGuild(userId, guildId);
}

export function syncExistingTagHolders(guild, cnsTagRoleId) {
  const members = guild.members.cache.filter(member => member.roles.cache.has(cnsTagRoleId));
  let synced = 0;
  
  for (const [userId, member] of members) {
    let user = getUser(userId);
    if (!user) {
      try {
        createUser(userId, member.user?.username ?? null, null, member.user?.avatar ?? null);
        user = getUser(userId);
      } catch {}
    }
    if (user && !user.cns_tag_equipped_at) {
      setCnsTagEquippedWithGuild(userId, guild.id);
      synced++;
    }
  }
  
  return synced;
}

