import db from '../database/connection.js';

export function createUser(userId, username = null, discriminator = null, avatar = null) {
  return db.prepare(`
    INSERT OR IGNORE INTO users (user_id, username, discriminator, avatar, xp, voice_xp, level, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 0, 0, strftime('%s', 'now'), strftime('%s', 'now'))
  `).run(userId, username, discriminator, avatar);
}

export function getUser(userId) {
  return db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
}

export function updateUserLastSeen(userId) {
  const now = Math.floor(Date.now() / 1000);
  return db.prepare('UPDATE users SET last_seen = ? WHERE user_id = ?').run(now, userId);
}

export function updateUserMessageCount(userId, count) {
  return db.prepare('UPDATE users SET message_count = ? WHERE user_id = ?').run(count, userId);
}

export function updateUserVoiceTime(userId, time) {
  return db.prepare('UPDATE users SET voice_time = ? WHERE user_id = ?').run(time, userId);
}

export function updateUserXP(userId, xpGain, voiceXpGain = 0) {
  return db.prepare(`
    UPDATE users 
    SET xp = xp + ?, 
        voice_xp = voice_xp + ?,
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(xpGain, voiceXpGain, userId);
}

export function updateUserLevel(userId, newLevel, voiceLevel = null, totalLevel = null) {
  return db.prepare(`
    UPDATE users 
    SET level = ?, 
        voice_level = COALESCE(?, voice_level),
        total_level = COALESCE(?, total_level),
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(newLevel, voiceLevel, totalLevel, userId);
}

export function getTopUsers(limit = 10) {
  return db.prepare(`
    SELECT user_id, xp, voice_xp, level, (xp + voice_xp) as total_xp
    FROM users 
    WHERE left_server = 0 OR left_server IS NULL
    ORDER BY total_xp DESC 
    LIMIT ?
  `).all(limit);
}

export function toggleLevelUpNotifications(userId) {
  return db.prepare(`
    UPDATE users 
    SET level_up_notifications = NOT level_up_notifications,
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(userId);
}


// Centralized flag management
export function markUserLeft(userId) {
  return db.prepare(`
    UPDATE users
    SET left_server = 1,
        updated_at  = strftime('%s','now')
    WHERE user_id = ? AND COALESCE(left_server,0) = 0
  `).run(userId);
}

export function markUserActive(userId, username = null, avatar = null) {
  return db.prepare(`
    UPDATE users
       SET left_server = CASE WHEN COALESCE(left_server,0)=1 THEN 0 ELSE left_server END,
           username    = COALESCE(?, username),
           avatar      = COALESCE(?, avatar),
           updated_at  = strftime('%s','now')
     WHERE user_id = ?
  `).run(username, avatar, userId);
}

// Whitelist helpers for safe left_server reset during real join events
export function allowLeftReset(userId) {
  return db.prepare('INSERT OR IGNORE INTO allow_left_reset(user_id) VALUES (?)').run(userId);
}

export function clearLeftReset(userId) {
  return db.prepare('DELETE FROM allow_left_reset WHERE user_id = ?').run(userId);
}

