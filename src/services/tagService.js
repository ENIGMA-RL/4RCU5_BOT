import logger from '../utils/logger.js';
import { rolesConfig } from '../config/configLoader.js';
import { fetchUserPrimaryGuild } from '../lib/discordProfileApi.js';
import { logTagSync } from '../utils/botLogger.js';
import { setCnsTagEquippedWithGuild, setCnsTagUnequippedWithGuild } from '../repositories/tagRepo.js';

const roleCfg = rolesConfig();
const MAIN_GUILD_ID     = roleCfg.mainGuildId || roleCfg.main_guild_id || null;
const TAG_GUILD_ID      = roleCfg.tagSourceGuildId || roleCfg.tagGuildId || null;
const TAG_GUILD_ROLE_ID = roleCfg.tagSourceRoleId || null; // role in tag guild that represents “CNS tag”
const TAG_ROLE_ID       = roleCfg.cnsOfficialRole || roleCfg.cns_official_role || null;       // role in main guild to assign to tag holders

let _cache = { at: 0, ids: new Set() };
const CACHE_MS = 60_000;

function now() { return Date.now(); }

async function fetchLiveTagSet(client) {
  if (!TAG_GUILD_ID || !TAG_GUILD_ROLE_ID) {
    logger.warn('[tagService] Missing TAG_GUILD_ID/TAG_GUILD_ROLE_ID; returning empty set.');
    return new Set();
  }
  logger.debug({ TAG_GUILD_ID, TAG_GUILD_ROLE_ID }, '[tagService] fetching live tag set');
  try {
    const tagGuild = await client.guilds.fetch(TAG_GUILD_ID);
    const members = await tagGuild.members.fetch();
    logger.trace({ totalMembers: members.size }, '[tagService] tag guild members fetched');
    const holders = members.filter(m => m.roles.cache.has(TAG_GUILD_ROLE_ID));
    const set = new Set(holders.map(m => m.id));
    const sample = Array.from(set).slice(0, 10);
    logger.info({ count: set.size, sample }, '[tagService] live tag set fetched');
    return set;
  } catch (e) {
    // Fallback: bot niet in tag-guild. Scan main guild en gebruik API primary_guild.
    logger.warn({ err: e, TAG_GUILD_ID }, '[tagService] cannot fetch tag guild; falling back to API scan over main guild');
    if (!MAIN_GUILD_ID) return new Set();
    const mainGuild = await client.guilds.fetch(MAIN_GUILD_ID);
    const members = await mainGuild.members.fetch();
    const out = new Set();
    let checked = 0;
    for (const m of members.values()) {
      try {
        const { identity_enabled, identity_guild_id } = await fetchUserPrimaryGuild(m.id, MAIN_GUILD_ID);
        if (identity_enabled && identity_guild_id === MAIN_GUILD_ID) out.add(m.id);
      } catch (err) {
        logger.debug({ err, userId: m.id }, '[tagService] primary_guild check failed');
      }
      checked++;
      if (checked % 25 === 0) await new Promise(r => setTimeout(r, 200));
    }
    logger.info({ count: out.size }, '[tagService] API fallback set built');
    return out;
  }
}

export async function getLiveTagSet(client, { useCache = true } = {}) {
  if (useCache && now() - _cache.at < CACHE_MS) {
    logger.debug({ ageMs: now() - _cache.at, size: _cache.ids.size }, '[tagService] using cached tag set');
    return _cache.ids;
  }
  const ids = await fetchLiveTagSet(client);
  _cache = { at: now(), ids };
  logger.debug({ size: ids.size }, '[tagService] refreshed tag set cache');
  return ids;
}

export async function getLiveTagCount(client, opt) {
  const ids = await getLiveTagSet(client, opt);
  logger.debug({ count: ids.size }, '[tagService] getLiveTagCount');
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
    if (!m) { logger.trace({ id }, '[tagService] live holder not in main guild, skip'); continue; }
    if (!m.roles.cache.has(TAG_ROLE_ID)) {
      try { await m.roles.add(TAG_ROLE_ID, 'CNS tag detected via tag guild'); added++;
        try { setCnsTagEquippedWithGuild(id, MAIN_GUILD_ID); } catch {}
        try { await logTagSync(client, id, m.user?.tag || id, 'Added', 'Mirror sync add'); } catch {}
      }
      catch (e) { logger.error({ err: e, userId: id }, '[tagService] add role failed'); }
    } else { logger.trace({ id }, '[tagService] already has TAG_ROLE_ID, noop'); }
  }

  for (const m of members.values()) {
    if (m.roles.cache.has(TAG_ROLE_ID) && !live.has(m.id)) {
      try { await m.roles.remove(TAG_ROLE_ID, 'CNS tag not present in tag guild'); removed++;
        try { setCnsTagUnequippedWithGuild(m.id, MAIN_GUILD_ID); } catch {}
        try { await logTagSync(client, m.id, m.user?.tag || m.id, 'Removed', 'Mirror sync remove'); } catch {}
      }
      catch (e) { logger.error({ err: e, userId: m.id }, '[tagService] remove role failed'); }
    } else if (!m.roles.cache.has(TAG_ROLE_ID) && live.has(m.id)) {
      // covered above in add pass; here just trace mismatches that remained
      logger.trace({ id: m.id }, '[tagService] holder without role after add pass (possibly race)');
    }
  }

  logger.info({ added, removed, total: live.size }, '[tagService] role sync done');
  return { added, removed, total: live.size };
}

export async function mirrorSingleUser(client, userId, hasTagNow) {
  if (!MAIN_GUILD_ID || !TAG_ROLE_ID) return;
  logger.debug({ userId, hasTagNow }, '[tagService] mirrorSingleUser');
  const mainGuild = await client.guilds.fetch(MAIN_GUILD_ID);
  const member = await mainGuild.members.fetch(userId).catch(() => null);
  if (!member) { logger.warn({ userId }, '[tagService] member not found in main guild'); return; }

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
  } else {
    logger.trace({ userId, hasTagNow, hasRole: member.roles.cache.has(TAG_ROLE_ID) }, '[tagService] no change for user');
  }
}

export default {
  getLiveTagSet,
  getLiveTagCount,
  syncTagRolesToMainGuild,
  mirrorSingleUser
};


