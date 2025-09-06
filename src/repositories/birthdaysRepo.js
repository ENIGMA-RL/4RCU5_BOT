import db from '../database/connection.js';

export function listBirthdaysForDay(day, month) {
  return db.prepare(`
    SELECT user_id, guild_id, username, birth_day, birth_month, birth_year
    FROM birthdays WHERE birth_day = ? AND birth_month = ?
  `).all(day, month);
}

export function upsertBirthday({ userId, guildId, username, day, month, year }) {
  return db.prepare(`
    INSERT OR REPLACE INTO birthdays (user_id, guild_id, username, birth_day, birth_month, birth_year, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, guildId, username, day, month, year, Date.now());
}

export function getUserBirthday(userId, guildId) {
  return db.prepare(`
    SELECT birth_day, birth_month, created_at
    FROM birthdays WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId);
}

export function removeUserBirthday(userId, guildId) {
  return db.prepare(`DELETE FROM birthdays WHERE user_id = ? AND guild_id = ?`).run(userId, guildId);
}

export function updateBirthdayUsername(userId, guildId, username) {
  return db.prepare(`UPDATE birthdays SET username = ? WHERE user_id = ? AND guild_id = ?`)
    .run(username, userId, guildId);
}

export function getBirthdaysForGuild(guildId) {
  return db.prepare(`
    SELECT user_id, guild_id, username, birth_day, birth_month
    FROM birthdays
    WHERE guild_id = ?
    ORDER BY birth_month ASC, birth_day ASC
  `).all(guildId);
}


