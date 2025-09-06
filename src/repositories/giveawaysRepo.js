import db from '../database/connection.js';
import logger from '../utils/logger.js';

/**
 * Veilige schema-ensure:
 * - Maakt tabel aan als hij niet bestaat (correcte schema).
 * - Als de tabel wél bestaat: alleen missende kolommen toevoegen met ALTER TABLE.
 * - Geen DROP/RENAME/REBUILD en al helemaal geen DELETEs.
 */
function ensureGiveawaysSchema() {
  if (process.env.SKIP_GIVEAWAYS_MIGRATION === '1') { logger.warn('Skipping giveaways schema migration (env flag set)'); return; }
  try {
    // 1) Maak aan als niet bestaat (vol schema, met constraints)
    db.exec(`
      CREATE TABLE IF NOT EXISTS giveaways (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        description TEXT NOT NULL,
        image_url TEXT,
        end_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open','closed','drawn_unpublished','published')),
        pending_winner_user_id TEXT,
        published_winner_user_id TEXT,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // 2) Bestaande kolommen ophalen
    const cols = db.prepare("PRAGMA table_info('giveaways')").all();
    const have = new Set(cols.map(c => c.name));

    // 3) Missende kolommen voorzichtig toevoegen (zonder NOT NULL afdwingen in ALTER)
    const addCol = (sql) => {
      try {
        db.exec(sql);
        logger.warn(`[GiveawaysSchema] Added missing column via: ${sql}`);
      } catch (e) {
        logger.error({ err: e }, `[GiveawaysSchema] Failed to add column: ${sql}`);
      }
    };

    if (!have.has('message_id'))               addCol(`ALTER TABLE giveaways ADD COLUMN message_id TEXT;`);
    if (!have.has('image_url'))                addCol(`ALTER TABLE giveaways ADD COLUMN image_url TEXT;`);
    if (!have.has('pending_winner_user_id'))   addCol(`ALTER TABLE giveaways ADD COLUMN pending_winner_user_id TEXT;`);
    if (!have.has('published_winner_user_id')) addCol(`ALTER TABLE giveaways ADD COLUMN published_winner_user_id TEXT;`);
    if (!have.has('created_by'))               addCol(`ALTER TABLE giveaways ADD COLUMN created_by TEXT;`);
    if (!have.has('created_at'))               addCol(`ALTER TABLE giveaways ADD COLUMN created_at INTEGER;`);
    if (!have.has('status'))                   addCol(`ALTER TABLE giveaways ADD COLUMN status TEXT;`);
    if (!have.has('end_at'))                   addCol(`ALTER TABLE giveaways ADD COLUMN end_at INTEGER;`);
    if (!have.has('guild_id'))                 addCol(`ALTER TABLE giveaways ADD COLUMN guild_id TEXT;`);
    if (!have.has('channel_id'))               addCol(`ALTER TABLE giveaways ADD COLUMN channel_id TEXT;`);

    // 4) Defaults invullen voor kritieke velden
    db.exec(`
      UPDATE giveaways
      SET
        status      = COALESCE(status, 'open'),
        description = COALESCE(description, ''),
        created_by  = COALESCE(created_by, ''),
        created_at  = COALESCE(created_at, strftime('%s','now')*1000),
        end_at      = COALESCE(end_at, strftime('%s','now')*1000)
      WHERE status IS NULL
         OR description IS NULL
         OR created_by IS NULL
         OR created_at IS NULL
         OR end_at IS NULL;
    `);
  } catch (e) {
    logger.error({ err: e }, 'Failed to ensure giveaways schema (safe)');
  }
}

// === Env-guard voor stap 4B ===
if (process.env.SKIP_GIVEAWAYS_MIGRATION === '1') {
  logger.warn('Skipping giveaways schema migration (env flag set)');
} else {
  if (process.env.SKIP_GIVEAWAYS_MIGRATION === '1') { logger.warn('Skipping giveaways schema migration (env flag set)'); } else { ensureGiveawaysSchema(); }
}

/* === Data-access functies === */

export function createGiveawayRow(id, guildId, channelId, messageId, description, imageUrl, endAt, createdBy) {
  let endAtMs = Number(endAt);
  if (!Number.isFinite(endAtMs)) {
    const t = new Date(endAt).getTime();
    endAtMs = Number.isFinite(t) ? t : NaN;
  }
  if (!Number.isFinite(endAtMs)) {
    throw new TypeError('invalid endAt for giveaways.end_at');
  }
  endAtMs = Math.trunc(endAtMs);
  const nowMs = Date.now();

  return db.prepare(`
    INSERT INTO giveaways (
      id, guild_id, channel_id, message_id, description, image_url, end_at, status, created_by, created_at
    ) VALUES (
      CAST(? AS TEXT),
      CAST(? AS TEXT),
      CAST(? AS TEXT),
      CAST(? AS TEXT),
      CAST(? AS TEXT),
      ?,
      CAST(? AS INTEGER),
      CAST(? AS TEXT),
      CAST(? AS TEXT),
      CAST(? AS INTEGER)
    )
  `).run(
    String(id),
    String(guildId),
    String(channelId),
    String(messageId || ''),
    String(description || ''),
    imageUrl || null,
    endAtMs,
    'open',
    String(createdBy || ''),
    nowMs
  );
}

export function getGiveawayById(id) {
  return db.prepare(`SELECT * FROM giveaways WHERE id = ?`).get(id);
}

export function getOpenInChannel(channelId) {
  return db.prepare(`
    SELECT * FROM giveaways
    WHERE channel_id = ? AND status = 'open'
    ORDER BY created_at DESC LIMIT 1
  `).get(channelId);
}

export function getToRestore() {
  return db.prepare(`
    SELECT * FROM giveaways
    WHERE status IN ('open','closed','drawn_unpublished')
  `).all();
}

export function updateGiveaway(id, fields) {
  const sets = [];
  const vals = [];
  if ('messageId' in fields)            { sets.push('message_id = ?'); vals.push(fields.messageId); }
  if ('status' in fields)               { sets.push('status = ?'); vals.push(fields.status); }
  if ('pendingWinnerUserId' in fields)  { sets.push('pending_winner_user_id = ?'); vals.push(fields.pendingWinnerUserId); }
  if ('publishedWinnerUserId' in fields){ sets.push('published_winner_user_id = ?'); vals.push(fields.publishedWinnerUserId); }
  if (!sets.length) return { changes: 0 };
  vals.push(id);
  return db.prepare(`UPDATE giveaways SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function setGiveawayImageUrl(id, url) {
  return db.prepare(`UPDATE giveaways SET image_url = ? WHERE id = ?`).run(url, id);
}

export function deleteGiveaway(id) {
  // Let op: dit verwijdert de giveaway zelf. Entries laten we bestaan tenzij je elders cascade/trigger hebt.
  return db.prepare(`DELETE FROM giveaways WHERE id = ?`).run(id);
}

export function addEntry(giveawayId, userId, tickets) {
  return db.prepare(`
    INSERT INTO giveaway_entries (giveaway_id, user_id, tickets, joined_at, withdrawn_at)
    VALUES (?, ?, ?, ?, NULL)
    ON CONFLICT(giveaway_id, user_id)
    DO UPDATE SET tickets=excluded.tickets, withdrawn_at=NULL, joined_at=excluded.joined_at
  `).run(giveawayId, userId, tickets, Date.now());
}

export function withdrawEntry(giveawayId, userId) {
  return db.prepare(`
    UPDATE giveaway_entries
    SET withdrawn_at = ?
    WHERE giveaway_id = ? AND user_id = ?
  `).run(Date.now(), giveawayId, userId);
}

export function listActiveEntries(giveawayId) {
  return db.prepare(`
    SELECT user_id, tickets, withdrawn_at
    FROM giveaway_entries
    WHERE giveaway_id = ? AND withdrawn_at IS NULL
  `).all(giveawayId);
}

// Added to satisfy imports in features/giveaway/service.js
export function countActiveEntries(giveawayId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS c
    FROM giveaway_entries
    WHERE giveaway_id = ? AND withdrawn_at IS NULL
  `).get(giveawayId);
  return (row && row.c) || 0;
}
