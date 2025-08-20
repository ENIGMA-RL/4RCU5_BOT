import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database
const db = new Database(path.join(__dirname, 'bot.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database tables
function initializeDatabase() {
  console.log('🔧 Initializing database...');

  // Users table for XP and leveling
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      xp INTEGER DEFAULT 0,
      voice_xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      voice_level INTEGER DEFAULT 0,
      total_level INTEGER DEFAULT 0,
      last_message_time INTEGER,
      last_voice_time INTEGER,
      level_up_notifications BOOLEAN DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
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

  // Add username column to existing birthdays table if it doesn't exist
  try {
    db.exec('ALTER TABLE birthdays ADD COLUMN username TEXT');
  } catch (error) {
    // Column already exists, ignore error
  }

  // Add missing columns to existing users table if they don't exist
  try {
    db.exec('ALTER TABLE users ADD COLUMN voice_level INTEGER DEFAULT 0');
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN total_level INTEGER DEFAULT 0');
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN left_server BOOLEAN DEFAULT 0');
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN voice_level INTEGER DEFAULT 0');
  } catch (error) {
    // Column already exists, ignore error
  }

  // Update existing users
  db.exec(`
    UPDATE users 
    SET voice_level = COALESCE(voice_level, 0),
        total_level = COALESCE(total_level, 0)
    WHERE voice_level IS NULL OR total_level IS NULL
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_level ON users(level);
    CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp);
  `);

  console.log('✅ Database initialized successfully');
}

// Initialize the database when the module is loaded
initializeDatabase();

// User XP and Leveling Functions
export function getUser(userId) {
  const stmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
  return stmt.get(userId);
}

export function createUser(userId) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO users (user_id, xp, voice_xp, level, created_at, updated_at)
    VALUES (?, 0, 0, 0, strftime('%s', 'now'), strftime('%s', 'now'))
  `);
  return stmt.run(userId);
}

export function updateUserXP(userId, xpGain, voiceXpGain = 0) {
  const stmt = db.prepare(`
    UPDATE users 
    SET xp = xp + ?, 
        voice_xp = voice_xp + ?,
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `);
  return stmt.run(xpGain, voiceXpGain, userId);
}

export function updateUserLevel(userId, newLevel, voiceLevel = null, totalLevel = null) {
  const stmt = db.prepare(`
    UPDATE users 
    SET level = ?, 
        voice_level = COALESCE(?, voice_level),
        total_level = COALESCE(?, total_level),
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `);
  return stmt.run(newLevel, voiceLevel, totalLevel, userId);
}

export function calculateLevel(xp, thresholds) {
  let level = 0;
  for (let i = 1; i <= 15; i++) {
    if (xp >= thresholds[i]) {
      level = i;
    } else {
      break;
    }
  }
  return level;
}

export function getXPForNextLevel(currentXP, thresholds) {
  let nextLevel = 1;
  for (let i = 1; i <= 15; i++) {
    if (currentXP < thresholds[i]) {
      nextLevel = i;
      break;
    }
  }
  return thresholds[nextLevel] || thresholds[15];
}

export function getCurrentLevelXP(currentXP, thresholds) {
  let currentLevel = 0;
  for (let i = 1; i <= 15; i++) {
    if (currentXP >= thresholds[i]) {
      currentLevel = i;
    } else {
      break;
    }
  }
  return currentLevel > 0 ? currentXP - thresholds[currentLevel - 1] : currentXP;
}

export function toggleLevelUpNotifications(userId) {
  const stmt = db.prepare(`
    UPDATE users 
    SET level_up_notifications = NOT level_up_notifications,
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `);
  return stmt.run(userId);
}

export function getTopUsers(limit = 10) {
  const stmt = db.prepare(`
    SELECT user_id, xp, voice_xp, level, (xp + voice_xp) as total_xp
    FROM users 
    WHERE left_server = 0 OR left_server IS NULL
    ORDER BY total_xp DESC 
    LIMIT ?
  `);
  return stmt.all(limit);
}

export function getUserRank(userId) {
  const stmt = db.prepare(`
    SELECT COUNT(*) + 1 as rank
    FROM users 
    WHERE (xp + voice_xp) > (
      SELECT (xp + voice_xp) 
      FROM users 
      WHERE user_id = ? AND (left_server = 0 OR left_server IS NULL)
    )
    AND (left_server = 0 OR left_server IS NULL)
  `);
  const result = stmt.get(userId);
  return result ? result.rank : null;
}

// Utility Functions
export function getTotalUsers() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE left_server = 0 OR left_server IS NULL');
  return stmt.get().count;
}

export function getTotalXP() {
  const stmt = db.prepare('SELECT SUM(xp + voice_xp) as total FROM users WHERE left_server = 0 OR left_server IS NULL');
  return stmt.get().total || 0;
}

// Close database connection (call this when shutting down)
export function closeDatabase() {
  db.close();
}

// Clean up deleted users and mark users who left the server
export async function cleanupDeletedUsers(client) {
  console.log('🧹 Starting database cleanup...');
  
  try {
    // Get all users from database
    const stmt = db.prepare('SELECT user_id FROM users');
    const users = stmt.all();
    
    let deletedCount = 0;
    let leftServerCount = 0;
    
    for (const user of users) {
      try {
        // Try to fetch user from Discord
        const discordUser = await client.users.fetch(user.user_id);
        
        // Check for suspicious usernames that indicate deleted users
        if (discordUser.username.toLowerCase().includes('deleted_user') || 
            discordUser.username.toLowerCase().includes('unknown') ||
            discordUser.username.toLowerCase().includes('deleted') ||
            discordUser.username.toLowerCase().includes('user') && discordUser.username.match(/^\d+$/)) {
          console.log(`🗑️ Removing user with suspicious username: ${discordUser.username} (${user.user_id})`);
          const deleteStmt = db.prepare('DELETE FROM users WHERE user_id = ?');
          deleteStmt.run(user.user_id);
          deletedCount++;
          continue;
        }
        
        // Update user's username in case it changed
        const updateStmt = db.prepare(`
          UPDATE users 
          SET username = ?, 
              left_server = 0,
              updated_at = strftime('%s', 'now')
          WHERE user_id = ?
        `);
        updateStmt.run(discordUser.username, user.user_id);
        
      } catch (error) {
        if (error.code === 10013) {
          // User not found (deleted)
          console.log(`🗑️ Removing deleted user: ${user.user_id}`);
          const deleteStmt = db.prepare('DELETE FROM users WHERE user_id = ?');
          deleteStmt.run(user.user_id);
          deletedCount++;
        } else if (error.code === 10007) {
          // User left the server
          console.log(`🚪 Marking user as left server: ${user.user_id}`);
          const updateStmt = db.prepare(`
            UPDATE users 
            SET left_server = 1,
                updated_at = strftime('%s', 'now')
            WHERE user_id = ?
          `);
          updateStmt.run(user.user_id);
          leftServerCount++;
        } else {
          console.log(`⚠️ Unknown error for user ${user.user_id}:`, error.code);
          // If we can't fetch the user for any reason, remove them
          console.log(`🗑️ Removing user due to fetch error: ${user.user_id}`);
          const deleteStmt = db.prepare('DELETE FROM users WHERE user_id = ?');
          deleteStmt.run(user.user_id);
          deletedCount++;
        }
      }
    }
    
    console.log(`✅ Cleanup complete: ${deletedCount} deleted users removed, ${leftServerCount} users marked as left server`);
    return { deletedCount, leftServerCount };
    
  } catch (error) {
    console.error('❌ Error during database cleanup:', error);
    throw error;
  }
}

// Get users who left the server (for display purposes)
export function getUsersWhoLeftServer() {
  const stmt = db.prepare('SELECT user_id, username, xp, voice_xp FROM users WHERE left_server = 1');
  return stmt.all();
}

// Mark user as left server
export function markUserLeftServer(userId) {
  const stmt = db.prepare(`
    UPDATE users 
    SET left_server = 1, 
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `);
  return stmt.run(userId);
}

// Mark user as active (rejoined server)
export function markUserActive(userId) {
  const stmt = db.prepare(`
    UPDATE users 
    SET left_server = 0, 
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `);
  return stmt.run(userId);
}

// Mark all users as left server (for reset purposes)
export function markAllUsersAsLeft() {
  const stmt = db.prepare(`
    UPDATE users 
    SET left_server = 1, 
        updated_at = strftime('%s', 'now')
  `);
  return stmt.run();
}

export default db; 