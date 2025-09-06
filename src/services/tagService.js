import logger from '../utils/logger.js';
import { rolesConfig } from '../config/configLoader.js';
import { logTagSync } from '../utils/botLogger.js';
import { setCnsTagEquippedWithGuild, setCnsTagUnequippedWithGuild } from '../repositories/tagRepo.js';

const roleCfg = rolesConfig();
const MAIN_GUILD_ID     = process.env.GUILD_ID || process.env.MAIN_GUILD_ID || roleCfg.mainGuildId || null;
const TAG_GUILD_ID      = process.env.TAG_GUILD_ID || roleCfg.tagSourceGuildId || roleCfg.tagGuildId || null;
const TAG_GUILD_ROLE_ID = process.env.TAG_GUILD_ROLE_ID || roleCfg.tagSourceRoleId || roleCfg.cnsOfficialRole || null; // role in tag guild that represents “CNS tag”
const TAG_ROLE_ID       = process.env.TAG_ROLE_ID || roleCfg.cnsOfficialRole || null;       // role in main guild to assign to tag holders

let _cache = { at: 0, ids: new Set() };
const CACHE_MS = 60_000;

function now() { return Date.now(); }

async function fetchLiveTagSet(client) {
  if (!TAG_GUILD_ID || !TAG_GUILD_ROLE_ID) {
    logger.warn('[tagService] Missing TAG_GUILD_ID/TAG_GUILD_ROLE_ID; returning empty set.');
    return new Set();
  }
  logger.debug({ TAG_GUILD_ID, TAG_GUILD_ROLE_ID }, '[tagService] fetching live tag set');
  const tagGuild = await client.guilds.fetch(TAG_GUILD_ID);
  const members = await tagGuild.members.fetch();
  const set = new Set(members.filter(m => m.roles.cache.has(TAG_GUILD_ROLE_ID)).map(m => m.id));
  logger.info({ count: set.size }, '[tagService] live tag set fetched');
  return set;
}

export async function getLiveTagSet(client, { useCache = true } = {}) {
  if (useCache && now() - _cache.at < CACHE_MS) return _cache.ids;
  const ids = await fetchLiveTagSet(client);
  _cache = { at: now(), ids };
  return ids;
}

export async function getLiveTagCount(client, opt) {
  const ids = await getLiveTagSet(client, opt);
  return ids.size;
}

export async function syncTagRolesToMainGuild(client) {
  if (!MAIN_GUILD_ID || !TAG_ROLE_ID) {
    logger.warn('[tagService] Missing MAIN_GUILD_ID/TAG_ROLE_ID; skipping role sync.');
    return { added: 0, removed: 0, total: 0 };
  }

  logger.debug({ MAIN_GUILD_ID, TAG_ROLE_ID }, '[tagService] starting role sync to main guild');
  const mainGuild = await client.guilds.fetch(MAIN_GUILD_ID);
  const live = await getLiveTagSet(client, { useCache: false });
  const members = await mainGuild.members.fetch();

  let added = 0, removed = 0;

  for (const id of live) {
    const m = members.get(id);
    if (!m) continue;
    if (!m.roles.cache.has(TAG_ROLE_ID)) {
      try { await m.roles.add(TAG_ROLE_ID, 'CNS tag detected via tag guild'); added++;
        try { setCnsTagEquippedWithGuild(id, MAIN_GUILD_ID); } catch {}
        try { await logTagSync(client, id, m.user?.tag || id, 'Added', 'Mirror sync add'); } catch {}
      }
      catch (e) { logger.error({ err: e, userId: id }, '[tagService] add role failed'); }
    }
  }

  for (const m of members.values()) {
    if (m.roles.cache.has(TAG_ROLE_ID) && !live.has(m.id)) {
      try { await m.roles.remove(TAG_ROLE_ID, 'CNS tag not present in tag guild'); removed++;
        try { setCnsTagUnequippedWithGuild(m.id, MAIN_GUILD_ID); } catch {}
        try { await logTagSync(client, m.id, m.user?.tag || m.id, 'Removed', 'Mirror sync remove'); } catch {}
      }
      catch (e) { logger.error({ err: e, userId: m.id }, '[tagService] remove role failed'); }
    }
  }

  logger.info({ added, removed, total: live.size }, '[tagService] role sync done');
  return { added, removed, total: live.size };
}

export async function mirrorSingleUser(client, userId, hasTagNow) {
  if (!MAIN_GUILD_ID || !TAG_ROLE_ID) return;
  const mainGuild = await client.guilds.fetch(MAIN_GUILD_ID);
  const member = await mainGuild.members.fetch(userId).catch(() => null);
  if (!member) return;

  if (hasTagNow && !member.roles.cache.has(TAG_ROLE_ID)) {
    try { await member.roles.add(TAG_ROLE_ID, 'tag mirror (event)');
      try { setCnsTagEquippedWithGuild(userId, MAIN_GUILD_ID); } catch {}
      try { await logTagSync(client, userId, member.user?.tag || userId, 'Added', 'Tag guild event'); } catch {}
    }
    catch (e) { logger.error({ err: e, userId }, '[tagService] add role (event) failed'); }
  } else if (!hasTagNow && member.roles.cache.has(TAG_ROLE_ID)) {
    try { await member.roles.remove(TAG_ROLE_ID, 'tag mirror (event)');
      try { setCnsTagUnequippedWithGuild(userId, MAIN_GUILD_ID); } catch {}
      try { await logTagSync(client, userId, member.user?.tag || userId, 'Removed', 'Tag guild event'); } catch {}
    }
    catch (e) { logger.error({ err: e, userId }, '[tagService] remove role (event) failed'); }
  }
}

export default {
  getLiveTagSet,
  getLiveTagCount,
  syncTagRolesToMainGuild,
  mirrorSingleUser
};


