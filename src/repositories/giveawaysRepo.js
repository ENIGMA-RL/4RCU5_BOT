import db from '../database/connection.js';
import logger from '../utils/logger.js';

function ensureGiveawaysSchema() {
  try {
    const cols = db.prepare("PRAGMA table_info('giveaways')").all();
    if (!cols || cols.length === 0) return; // created by initializer
    const byName = new Map(cols.map(c => [c.name, c]));
    let rebuild = false;
    const required = {
      id:        { type: 'TEXT',    notnull: true  },
      guild_id:  { type: 'TEXT',    notnull: true  },
      channel_id:{ type: 'TEXT',    notnull: true  },
      message_id:{ type: 'TEXT',    notnull: false },
      description:{ type: 'TEXT',   notnull: true  },
      image_url: { type: 'TEXT',    notnull: false },
      end_at:    { type: 'INTEGER', notnull: true  },
      status:    { type: 'TEXT',    notnull: true  },
      pending_winner_user_id:   { type: 'TEXT', notnull: false },
      published_winner_user_id: { type: 'TEXT', notnull: false },
      created_by:{ type: 'TEXT',    notnull: true  },
      created_at:{ type: 'INTEGER', notnull: true  },
    };
    for (const [name, spec] of Object.entries(required)) {
      const col = byName.get(name);
      if (!col) { rebuild = true; break; }
      const t = String(col.type || '').toUpperCase();
      if (!t.includes(spec.type)) { rebuild = true; break; }
      if (typeof spec.notnull === 'boolean' && !!col.notnull !== spec.notnull) { rebuild = true; break; }
    }
    if (!rebuild) return;
    logger.warn('Rebuilding giveaways table to match expected schema (non-destructive)');
    db.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS giveaways_new (
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
      INSERT INTO giveaways_new (
        id, guild_id, channel_id, message_id, description, image_url, end_at, status,
        pending_winner_user_id, published_winner_user_id, created_by, created_at
      )
      SELECT 
        id,
        COALESCE(guild_id, ''),
        COALESCE(channel_id, ''),
        NULLIF(message_id, ''),
        COALESCE(description, ''),
        image_url,
        CAST(COALESCE(end_at, strftime('%s','now')*1000) AS INTEGER),
        CASE
          WHEN status IN ('open','closed','drawn_unpublished','published') THEN status
          ELSE 'open'
        END,
        pending_winner_user_id,
        published_winner_user_id,
        COALESCE(created_by, ''),
        CAST(COALESCE(created_at, strftime('%s','now')*1000) AS INTEGER)
      FROM giveaways;
      DROP TABLE giveaways;
      ALTER TABLE giveaways_new RENAME TO giveaways;
      COMMIT;
    `);
  } catch (e) {
    logger.error({ err: e }, 'Failed to ensure giveaways schema');
  }
}

ensureGiveawaysSchema();

export function createGiveawayRow(id, guildId, channelId, messageId, description, imageUrl, endAt, createdBy) {
  // allow either ms number or date-like string
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

export function setGiveawayImageUrl(id, url) {
  return db.prepare(`UPDATE giveaways SET image_url = ? WHERE id = ?`).run(url, id);
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


