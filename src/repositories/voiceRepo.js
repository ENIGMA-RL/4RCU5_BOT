import db from '../database/connection.js';

export function createVoiceChannel(channelId, guildId, ownerId, name) {
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(`
    INSERT OR REPLACE INTO voice_channels (channel_id, guild_id, owner_id, created_at, name)
    VALUES (?, ?, ?, ?, ?)
  `).run(channelId, guildId, ownerId, now, name);
}

export function getVoiceChannel(channelId) {
  return db.prepare('SELECT * FROM voice_channels WHERE channel_id = ?').get(channelId);
}

export function updateVoiceChannelOwner(channelId, ownerId) {
  return db.prepare('UPDATE voice_channels SET owner_id = ? WHERE channel_id = ?').run(ownerId, channelId);
}

export function updateVoiceChannelLock(channelId, isLocked) {
  return db.prepare('UPDATE voice_channels SET is_locked = ? WHERE channel_id = ?').run(isLocked ? 1 : 0, channelId);
}

export function updateVoiceChannelLimit(channelId, limit) {
  return db.prepare('UPDATE voice_channels SET user_limit = ? WHERE channel_id = ?').run(limit, channelId);
}

export function updateVoiceChannelName(channelId, name) {
  return db.prepare('UPDATE voice_channels SET name = ? WHERE channel_id = ?').run(name, channelId);
}

export function deleteVoiceChannel(channelId) {
  return db.prepare('DELETE FROM voice_channels WHERE channel_id = ?').run(channelId);
}

export function getVoiceChannelsByGuild(guildId) {
  return db.prepare('SELECT * FROM voice_channels WHERE guild_id = ?').all(guildId);
}

export function grantVoiceChannelPermission(channelId, userId, permissionType) {
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(`
    INSERT OR REPLACE INTO voice_channel_permissions (channel_id, user_id, permission_type, granted_at)
    VALUES (?, ?, ?, ?)
  `).run(channelId, userId, permissionType, now);
}

export function revokeVoiceChannelPermission(channelId, userId, permissionType) {
  return db.prepare(`
    DELETE FROM voice_channel_permissions 
    WHERE channel_id = ? AND user_id = ? AND permission_type = ?
  `).run(channelId, userId, permissionType);
}

export function getVoiceChannelPermissions(channelId) {
  return db.prepare('SELECT * FROM voice_channel_permissions WHERE channel_id = ?').all(channelId);
}

export function checkVoiceChannelPermission(channelId, userId, permissionType) {
  const result = db.prepare(`
    SELECT COUNT(*) as count 
    FROM voice_channel_permissions 
    WHERE channel_id = ? AND user_id = ? AND permission_type = ?
  `).get(channelId, userId, permissionType);
  return result && result.count > 0;
}


