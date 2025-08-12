/**
 * @typedef {Object} CachedMessage
 * @property {string} id
 * @property {string|null} guildId
 * @property {string|null} channelId
 * @property {string|null} authorId
 * @property {string|null} authorTag
 * @property {string} content
 * @property {Array<{name: string, url: string}>} attachments
 * @property {number} embeds
 * @property {number|null} createdTimestamp
 */

const cache = new Map();
const maxEntries = 5000;

export function cacheMessage(m) {
  if (!m) return;
  const attachments = m.attachments ? [...m.attachments.values()].map(a => ({ name: a.name, url: a.url })) : [];
  const entry = {
    id: m.id,
    guildId: m.guildId ?? null,
    channelId: m.channelId ?? null,
    authorId: m.author?.id ?? null,
    authorTag: m.author?.tag ?? null,
    content: m.content ?? '',
    attachments,
    embeds: Array.isArray(m.embeds) ? m.embeds.length : 0,
    createdTimestamp: m.createdTimestamp ?? null
  };
  cache.set(m.id, entry);
  if (cache.size > maxEntries) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

export function getCachedMessage(id) {
  return cache.get(id) ?? null;
}

export function dropCachedMessage(id) {
  cache.delete(id);
} 