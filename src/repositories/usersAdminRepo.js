import db from '../database/connection.js';

export function getAllUsers() {
  return db.prepare('SELECT user_id, username, xp, voice_xp FROM users').all();
}

export function markUserLeftServer(userId) {
  return db.prepare(`
    UPDATE users 
    SET left_server = 1, 
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(userId);
}

export function markUserActive(userId) {
  return db.prepare(`
    UPDATE users 
    SET left_server = 0, 
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(userId);
}

export async function cleanupDeletedUsers(client) {
  const users = db.prepare('SELECT user_id FROM users').all();
  let deletedCount = 0;
  let leftServerCount = 0;
  for (const user of users) {
    try {
      const discordUser = await client.users.fetch(user.user_id);
      if (
        discordUser.username.toLowerCase().includes('deleted_user') ||
        discordUser.username.toLowerCase().includes('unknown') ||
        discordUser.username.toLowerCase().includes('deleted') ||
        (discordUser.username.toLowerCase().includes('user') && discordUser.username.match(/^\d+$/))
      ) {
        db.prepare('DELETE FROM users WHERE user_id = ?').run(user.user_id);
        deletedCount++;
        continue;
      }
      db.prepare(`UPDATE users SET username = ?, left_server = 0, updated_at = strftime('%s','now') WHERE user_id = ?`).run(discordUser.username, user.user_id);
    } catch (error) {
      if (error.code === 10013) {
        db.prepare('DELETE FROM users WHERE user_id = ?').run(user.user_id);
        deletedCount++;
      } else if (error.code === 10007) {
        db.prepare(`UPDATE users SET left_server = 1, updated_at = strftime('%s','now') WHERE user_id = ?`).run(user.user_id);
        leftServerCount++;
      } else {
        db.prepare('DELETE FROM users WHERE user_id = ?').run(user.user_id);
        deletedCount++;
      }
    }
  }
  return { deletedCount, leftServerCount };
}


