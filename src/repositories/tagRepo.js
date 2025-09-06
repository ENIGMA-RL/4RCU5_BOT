import db from '../database/connection.js';

export function createCnsTagTracking(userId, guildId) {
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(`
    INSERT OR REPLACE INTO cns_tag_tracking (user_id, guild_id, equipped_at, last_updated)
    VALUES (?, ?, ?, ?)
  `).run(userId, guildId, now, now);
}

export function updateCnsTagTracking(userId, equippedAt, unequippedAt, totalTime) {
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(`
    UPDATE cns_tag_tracking 
    SET equipped_at = ?, unequipped_at = ?, total_time_equipped = ?, last_updated = ?
    WHERE user_id = ?
  `).run(equippedAt, unequippedAt, totalTime, now, userId);
}

export function getCnsTagStatus(userId) {
  return db.prepare('SELECT * FROM cns_tag_tracking WHERE user_id = ?').get(userId);
}

export function isCnsTagCurrentlyEquipped(userId) {
  const user = db.prepare('SELECT cns_tag_equipped_at, cns_tag_unequipped_at FROM users WHERE user_id = ?').get(userId);
  return user && user.cns_tag_equipped_at && !user.cns_tag_unequipped_at;
}

export function setCnsTagEquippedWithGuild(userId, guildId) {
  const now = Math.floor(Date.now() / 1000);
  const userStmt = db.prepare(`
    UPDATE users 
    SET cns_tag_equipped_at = ?
    WHERE user_id = ?
  `);
  const userResult = userStmt.run(now, userId);

  try {
    const existing = getCnsTagStatus(userId);
    if (existing) {
      updateCnsTagTracking(userId, now, existing.unequipped_at, existing.total_time_equipped || 0);
    } else {
      createCnsTagTracking(userId, guildId);
    }
  } catch {}

  return userResult;
}

export function setCnsTagUnequippedWithGuild(userId, guildId) {
  const now = Math.floor(Date.now() / 1000);
  const userStmt = db.prepare(`
    UPDATE users 
    SET cns_tag_unequipped_at = ?
    WHERE user_id = ?
  `);
  const userResult = userStmt.run(now, userId);

  try {
    const existing = getCnsTagStatus(userId);
    if (existing && existing.equipped_at) {
      const equippedTime = now - existing.equipped_at;
      const totalTime = (existing.total_time_equipped || 0) + equippedTime;
      updateCnsTagTracking(userId, existing.equipped_at, now, totalTime);
    }
  } catch {}

  return userResult;
}

export function syncExistingTagHolders(guild, cnsTagRoleId) {
  const members = guild.members.cache.filter(member => member.roles.cache.has(cnsTagRoleId));
  let synced = 0;
  for (const [userId, member] of members) {
    const row = db.prepare('SELECT cns_tag_equipped_at FROM users WHERE user_id = ?').get(userId);
    if (!row) {
      db.prepare(`
        INSERT OR IGNORE INTO users (user_id, username, avatar, xp, voice_xp, level, created_at, updated_at)
        VALUES (?, ?, ?, 0, 0, 0, strftime('%s', 'now'), strftime('%s', 'now'))
      `).run(userId, member.user?.username ?? null, member.user?.avatar ?? null);
    }
    const updated = db.prepare('SELECT cns_tag_equipped_at FROM users WHERE user_id = ?').get(userId);
    if (!updated?.cns_tag_equipped_at) {
      setCnsTagEquippedWithGuild(userId, guild.id);
      synced++;
    }
  }
  return synced;
}

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


