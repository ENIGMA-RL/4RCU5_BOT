import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, '..', 'database', 'bot.db'));

function migrate() {
  try {
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
    
    logger.info('Music database tables migrated successfully');
  } catch (error) {
    logger.error({ err: error }, 'Error migrating music database tables');
  }
}

// Initialize migration
migrate();

// Guild state helpers
export function loadState(guildId) {
  const stmt = db.prepare('SELECT * FROM guild_music_state WHERE guild_id = ?');
  return stmt.get(guildId) || {
    guild_id: guildId,
    volume: 100,
    loop_mode: 'off',
    autoplay: 0,
    idle_timeout_sec: 300,
    updated_at: Math.floor(Date.now() / 1000)
  };
}

export function saveState(guildId, state) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO guild_music_state 
    (guild_id, volume, loop_mode, autoplay, idle_timeout_sec, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    guildId,
    state.volume || 100,
    state.loop_mode || 'off',
    state.autoplay || 0,
    state.idle_timeout_sec || 300,
    Math.floor(Date.now() / 1000)
  );
}

// Queue helpers
export function loadQueue(guildId) {
  const stmt = db.prepare(`
    SELECT * FROM guild_queue 
    WHERE guild_id = ? 
    ORDER BY position ASC
  `);
  return stmt.all(guildId);
}

export function saveQueue(guildId, tracks) {
  const transaction = db.transaction(() => {
    // Clear existing queue
    db.prepare('DELETE FROM guild_queue WHERE guild_id = ?').run(guildId);
    
    // Insert new tracks
    const insertStmt = db.prepare(`
      INSERT INTO guild_queue 
      (guild_id, position, title, url, source, duration_ms, requested_by_id, thumb, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    tracks.forEach((track, index) => {
      insertStmt.run(
        guildId,
        index,
        track.title,
        track.url,
        track.source || 'unknown',
        track.duration?.seconds ? track.duration.seconds * 1000 : 0,
        track.requestedBy?.id || track.requested_by_id,
        track.thumbnail || track.thumb,
        Math.floor(Date.now() / 1000)
      );
    });
  });
  
  return transaction();
}

export function addToQueue(guildId, track, position = null) {
  const transaction = db.transaction(() => {
    if (position === null) {
      // Add to end
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM guild_queue WHERE guild_id = ?');
      const { count } = countStmt.get(guildId);
      position = count;
    } else {
      // Shift existing tracks
      db.prepare(`
        UPDATE guild_queue 
        SET position = position + 1 
        WHERE guild_id = ? AND position >= ?
      `).run(guildId, position);
    }
    
    const insertStmt = db.prepare(`
      INSERT INTO guild_queue 
      (guild_id, position, title, url, source, duration_ms, requested_by_id, thumb, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return insertStmt.run(
      guildId,
      position,
      track.title,
      track.url,
      track.source || 'unknown',
      track.duration?.seconds ? track.duration.seconds * 1000 : 0,
      track.requestedBy?.id || track.requested_by_id,
      track.thumbnail || track.thumb,
      Math.floor(Date.now() / 1000)
    );
  });
  
  return transaction();
}

export function removeFromQueue(guildId, position) {
  const transaction = db.transaction(() => {
    // Remove track
    const deleteStmt = db.prepare('DELETE FROM guild_queue WHERE guild_id = ? AND position = ?');
    const result = deleteStmt.run(guildId, position);
    
    // Shift remaining tracks
    db.prepare(`
      UPDATE guild_queue 
      SET position = position - 1 
      WHERE guild_id = ? AND position > ?
    `).run(guildId, position);
    
    return result;
  });
  
  return transaction();
}

export function clearQueue(guildId) {
  const stmt = db.prepare('DELETE FROM guild_queue WHERE guild_id = ?');
  return stmt.run(guildId);
}

export function shuffleQueue(guildId) {
  const transaction = db.transaction(() => {
    const tracks = loadQueue(guildId);
    if (tracks.length <= 1) return;
    
    // Fisher-Yates shuffle
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    
    // Re-save with new positions
    saveQueue(guildId, tracks);
  });
  
  return transaction();
}

// Resume state helpers
export function saveResumeState(guildId, trackUrl, positionMs, voiceChannelId, textChannelId) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO guild_resume_state 
    (guild_id, track_url, track_position_ms, voice_channel_id, text_channel_id, saved_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    guildId,
    trackUrl,
    positionMs,
    voiceChannelId,
    textChannelId,
    Math.floor(Date.now() / 1000)
  );
}

export function loadResumeState(guildId) {
  const stmt = db.prepare('SELECT * FROM guild_resume_state WHERE guild_id = ?');
  return stmt.get(guildId);
}

export function clearResumeState(guildId) {
  const stmt = db.prepare('DELETE FROM guild_resume_state WHERE guild_id = ?');
  return stmt.run(guildId);
}

// Utility functions
export function getQueueLength(guildId) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM guild_queue WHERE guild_id = ?');
  return stmt.get(guildId).count;
}

export function getQueuePosition(guildId, position) {
  const stmt = db.prepare('SELECT * FROM guild_queue WHERE guild_id = ? AND position = ?');
  return stmt.get(guildId, position);
}

export { db };
