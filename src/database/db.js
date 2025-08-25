import betterSqlite3 from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine environment and load appropriate config
let botConfig;
try {
  const env = process.env.NODE_ENV || 'development';
  const configPath = path.join(__dirname, '..', 'config', env === 'development' ? 'test' : '', 'bot.json');
  const { readFileSync } = await import('fs');
  botConfig = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
  console.warn('Failed to load bot config, using default database path');
  botConfig = { database_path: 'bot.db' };
}

// Initialize database
const dbPath = path.join(__dirname, '..', '..', botConfig.database_path || 'bot.db');
const db = new betterSqlite3(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

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

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_level ON users(level);
    CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp);
    CREATE INDEX IF NOT EXISTS idx_users_message_count ON users(message_count);
    CREATE INDEX IF NOT EXISTS idx_users_voice_time ON users(voice_time);
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

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_gv_status ON giveaways(status);
    CREATE INDEX IF NOT EXISTS idx_gve_gv ON giveaway_entries(giveaway_id);
  `);

  console.log('✅ Database initialized successfully');
}

// Initialize database on import
initializeDatabase();

// User management functions
export function createUser(userId, username = null, discriminator = null, avatar = null) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO users (user_id, username, discriminator, avatar, xp, voice_xp, level, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 0, 0, strftime('%s', 'now'), strftime('%s', 'now'))
  `);
  return stmt.run(userId, username, discriminator, avatar);
}

export function getUser(userId) {
  const stmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
  return stmt.get(userId);
}

export function updateUserLastSeen(userId) {
  const stmt = db.prepare('UPDATE users SET last_seen = ? WHERE user_id = ?');
  const now = Math.floor(Date.now() / 1000);
  return stmt.run(now, userId);
}

export function updateUserMessageCount(userId, count) {
  const stmt = db.prepare('UPDATE users SET message_count = ? WHERE user_id = ?');
  return stmt.run(count, userId);
}

export function updateUserVoiceTime(userId, time) {
  const stmt = db.prepare('UPDATE users SET voice_time = ? WHERE user_id = ?');
  return stmt.run(time, userId);
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

export function updateCnsTagStatus(userId, equippedAt, unequippedAt) {
  const stmt = db.prepare(`
    UPDATE users 
    SET cns_tag_equipped_at = ?, cns_tag_unequipped_at = ?
    WHERE user_id = ?
  `);
  return stmt.run(equippedAt, unequippedAt, userId);
}

export function getAllUsers() {
  const stmt = db.prepare('SELECT * FROM users ORDER BY level DESC, xp DESC');
  return stmt.all();
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

export function getUsersByLevel(level) {
  const stmt = db.prepare('SELECT * FROM users WHERE level = ? ORDER BY xp DESC');
  return stmt.all(level);
}

// CNS tag tracking functions
export function createCnsTagTracking(userId, guildId) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO cns_tag_tracking (user_id, guild_id, equipped_at, last_updated)
    VALUES (?, ?, ?, ?)
  `);
  const now = Math.floor(Date.now() / 1000);
  return stmt.run(userId, guildId, now, now);
}

export function updateCnsTagTracking(userId, equippedAt, unequippedAt, totalTime) {
  const stmt = db.prepare(`
    UPDATE cns_tag_tracking 
    SET equipped_at = ?, unequipped_at = ?, total_time_equipped = ?, last_updated = ?
    WHERE user_id = ?
  `);
  const now = Math.floor(Date.now() / 1000);
  return stmt.run(equippedAt, unequippedAt, totalTime, now, userId);
}

export function getCnsTagStatus(userId) {
  const stmt = db.prepare('SELECT * FROM cns_tag_tracking WHERE user_id = ?');
  return stmt.get(userId);
}

export function getAllCnsTagUsers() {
  const stmt = db.prepare('SELECT * FROM cns_tag_tracking WHERE equipped_at IS NOT NULL AND unequipped_at IS NULL');
  return stmt.all();
}

// Voice channel functions
export function createVoiceChannel(channelId, guildId, ownerId, name) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO voice_channels (channel_id, guild_id, owner_id, created_at, name)
    VALUES (?, ?, ?, ?, ?)
  `);
  const now = Math.floor(Date.now() / 1000);
  return stmt.run(channelId, guildId, ownerId, now, name);
}

export function getVoiceChannel(channelId) {
  const stmt = db.prepare('SELECT * FROM voice_channels WHERE channel_id = ?');
  return stmt.get(channelId);
}

export function updateVoiceChannelOwner(channelId, ownerId) {
  const stmt = db.prepare('UPDATE voice_channels SET owner_id = ? WHERE channel_id = ?');
  return stmt.run(ownerId, channelId);
}

export function updateVoiceChannelLock(channelId, isLocked) {
  const stmt = db.prepare('UPDATE voice_channels SET is_locked = ? WHERE channel_id = ?');
  return stmt.run(isLocked ? 1 : 0, channelId);
}

export function updateVoiceChannelLimit(channelId, limit) {
  const stmt = db.prepare('UPDATE voice_channels SET user_limit = ? WHERE channel_id = ?');
  return stmt.run(limit, channelId);
}

export function updateVoiceChannelName(channelId, name) {
  const stmt = db.prepare('UPDATE voice_channels SET name = ? WHERE channel_id = ?');
  return stmt.run(name, channelId);
}

export function deleteVoiceChannel(channelId) {
  const stmt = db.prepare('DELETE FROM voice_channels WHERE channel_id = ?');
  return stmt.run(channelId);
}

export function getVoiceChannelsByGuild(guildId) {
  const stmt = db.prepare('SELECT * FROM voice_channels WHERE guild_id = ?');
  return stmt.all(guildId);
}

// Voice channel permission functions
export function grantVoiceChannelPermission(channelId, userId, permissionType) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO voice_channel_permissions (channel_id, user_id, permission_type, granted_at)
    VALUES (?, ?, ?, ?)
  `);
  const now = Math.floor(Date.now() / 1000);
  return stmt.run(channelId, userId, permissionType, now);
}

export function revokeVoiceChannelPermission(channelId, userId, permissionType) {
  const stmt = db.prepare(`
    DELETE FROM voice_channel_permissions 
    WHERE channel_id = ? AND user_id = ? AND permission_type = ?
  `);
  return stmt.run(channelId, userId, permissionType);
}

export function getVoiceChannelPermissions(channelId) {
  const stmt = db.prepare('SELECT * FROM voice_channel_permissions WHERE channel_id = ?');
  return stmt.all(channelId);
}

export function checkVoiceChannelPermission(channelId, userId, permissionType) {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count 
    FROM voice_channel_permissions 
    WHERE channel_id = ? AND user_id = ? AND permission_type = ?
  `);
  const result = stmt.get(channelId, userId, permissionType);
  return result && result.count > 0;
}

// Clean giveaway database functions
export function createGiveawayRow(id, guildId, channelId, messageId, description, imageUrl, endAt, createdBy) {
  const stmt = db.prepare(`
    INSERT INTO giveaways (id, guild_id, channel_id, message_id, description, image_url, end_at, status, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `);
  return stmt.run(id, guildId, channelId, messageId, description, imageUrl, endAt, createdBy, Date.now());
}

export function getGiveawayById(id) {
  return db.prepare(`SELECT * FROM giveaways WHERE id = ?`).get(id);
}

export function getOpenInChannel(channelId) {
  return db.prepare(`SELECT * FROM giveaways WHERE channel_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1`).get(channelId);
}

export function getToRestore() {
  return db.prepare(`SELECT * FROM giveaways WHERE status IN ('open','closed','drawn_unpublished')`).all();
}

export function updateGiveaway(id, fields) {
  const sets = [];
  const vals = [];
  if ('messageId' in fields) { sets.push('message_id = ?'); vals.push(fields.messageId); }
  if ('status' in fields) { sets.push('status = ?'); vals.push(fields.status); }
  if ('pendingWinnerUserId' in fields) { sets.push('pending_winner_user_id = ?'); vals.push(fields.pendingWinnerUserId); }
  if ('publishedWinnerUserId' in fields) { sets.push('published_winner_user_id = ?'); vals.push(fields.publishedWinnerUserId); }
  if (!sets.length) return { changes: 0 };
  vals.push(id);
  return db.prepare(`UPDATE giveaways SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteGiveaway(id) {
  return db.prepare(`DELETE FROM giveaways WHERE id = ?`).run(id);
}

export function addEntry(giveawayId, userId, tickets) {
  return db.prepare(`
    INSERT INTO giveaway_entries (giveaway_id, user_id, tickets, joined_at, withdrawn_at)
    VALUES (?, ?, ?, ?, NULL)
    ON CONFLICT(giveaway_id, user_id) DO UPDATE SET tickets=excluded.tickets, withdrawn_at=NULL, joined_at=excluded.joined_at
  `).run(giveawayId, userId, tickets, Date.now());
}

export function withdrawEntry(giveawayId, userId) {
  return db.prepare(`UPDATE giveaway_entries SET withdrawn_at = ? WHERE giveaway_id = ? AND user_id = ?`)
    .run(Date.now(), giveawayId, userId);
}

export function listActiveEntries(giveawayId) {
  return db.prepare(`SELECT user_id, tickets, withdrawn_at FROM giveaway_entries WHERE giveaway_id = ? AND withdrawn_at IS NULL`).all(giveawayId);
}

export function countActiveEntries(giveawayId) {
  return db.prepare(`SELECT COUNT(*) c FROM giveaway_entries WHERE giveaway_id = ? AND withdrawn_at IS NULL`).get(giveawayId).c || 0;
}

// Role tenure
export function recordRoleFirstSeen(guildId, userId, roleId) {
  const existing = db.prepare(`SELECT first_seen_at FROM role_tenure WHERE guild_id=? AND user_id=? AND role_id=?`).get(guildId, userId, roleId);
  if (!existing) {
    db.prepare(`INSERT INTO role_tenure (guild_id, user_id, role_id, first_seen_at) VALUES (?,?,?,?)`).run(guildId, userId, roleId, Date.now());
  }
}

export function getRoleFirstSeen(guildId, userId, roleId) {
  const row = db.prepare(`SELECT first_seen_at FROM role_tenure WHERE guild_id=? AND user_id=? AND role_id=?`).get(guildId, userId, roleId);
  return row ? row.first_seen_at : null;
}

// Cleanup and utility functions
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

export function getUsersWhoLeftServer() {
  const stmt = db.prepare('SELECT user_id, username, xp, voice_xp FROM users WHERE left_server = 1');
  return stmt.all();
}

export function markUserLeftServer(userId) {
  const stmt = db.prepare(`
    UPDATE users 
    SET left_server = 1, 
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `);
  return stmt.run(userId);
}

export function markUserActive(userId) {
  const stmt = db.prepare(`
    UPDATE users 
    SET left_server = 0, 
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `);
  return stmt.run(userId);
}

export function getTotalUsers() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE left_server = 0 OR left_server IS NULL');
  return stmt.get().count;
}

export function getTotalXP() {
  const stmt = db.prepare('SELECT SUM(xp + voice_xp) as total FROM users WHERE left_server = 0 OR left_server IS NULL');
  return stmt.get().total || 0;
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

export function toggleLevelUpNotifications(userId) {
  const stmt = db.prepare(`
    UPDATE users 
    SET level_up_notifications = NOT level_up_notifications,
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `);
  return stmt.run(userId);
}

export function markAllUsersAsLeft() {
  const stmt = db.prepare(`
    UPDATE users 
    SET left_server = 1, 
        updated_at = strftime('%s', 'now')
  `);
  return stmt.run();
}

export function closeDatabase() {
  db.close();
}

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

export function setCnsTagEquipped(userId) {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    UPDATE users 
    SET cns_tag_equipped_at = ?, cns_tag_unequipped_at = NULL
    WHERE user_id = ?
  `);
  return stmt.run(now, userId);
}

export function setCnsTagUnequipped(userId) {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    UPDATE users 
    SET cns_tag_unequipped_at = ?
    WHERE user_id = ?
  `);
  return stmt.run(now, userId);
}

export function syncExistingTagHolders(guild, cnsTagRoleId) {
  const members = guild.members.cache.filter(member => member.roles.cache.has(cnsTagRoleId));
  let synced = 0;
  
  for (const [userId, member] of members) {
    const user = getUser(userId);
    if (user && !user.cns_tag_equipped_at) {
      setCnsTagEquipped(userId);
      synced++;
    }
  }
  
  return synced;
}

export default db;
