import logger from '../utils/logger.js';
import { rolesConfig, channelsConfig } from '../config/configLoader.js';
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

// Verbose toggles
const VERBOSE = (process.env.TAG_LOG_VERBOSITY || '').toLowerCase() === 'debug';
const DEBUG_RAW = (process.env.TAG_DEBUG_RAW || '0') === '1';
const UPDATE_STATS_ON_CHANGE = (process.env.TAG_UPDATE_STATS_ON_CHANGE || '0') === '1';

function logv(msg, extra) { if (VERBOSE) logger.debug({ ...extra }, `[TagService] ${msg}`); }

async function maybeUpdateStats(client) {
  if (!UPDATE_STATS_ON_CHANGE) return;
  try {
    const statsChannelId = channelsConfig()?.statsChannelId;
    const guildId = MAIN_GUILD_ID;
    if (!guildId || !statsChannelId) return;
    const { updateStats } = await import('../features/stats/statsUpdater.js');
    await updateStats(client, guildId, statsChannelId);
  } catch (err) {
    logger.warn({ err }, '[TagService] failed to update stats after role change');
  }
}

export class TagService {
  constructor(client) {
    this.client = client;
    const r = rolesConfig?.() || {};
    this.MAIN_GUILD_ID = MAIN_GUILD_ID || process.env.GUILD_ID || r.guildId || null;
    this.TAG_GUILD_ID  = TAG_GUILD_ID  || process.env.TAG_GUILD_ID || r.cnsTagGuildId || r.tagGuildId || null;
    this.TAG_ROLE_ID   = TAG_GUILD_ROLE_ID || process.env.TAG_ROLE_ID || r.cnsTagRoleId || r.tagRoleId || null;
    this.DEST_ROLE_ID  = TAG_ROLE_ID   || process.env.DEST_ROLE_ID || r.cnsOfficialRole || r.destRoleId || null;

    logger.info({
      MAIN_GUILD_ID: this.MAIN_GUILD_ID,
      TAG_GUILD_ID : this.TAG_GUILD_ID,
      TAG_ROLE_ID  : this.TAG_ROLE_ID,
      DEST_ROLE_ID : this.DEST_ROLE_ID,
      VERBOSE,
      DEBUG_RAW,
      UPDATE_STATS_ON_CHANGE
    }, '[TagService] resolved IDs/config');
  }

  async start() {
    if (!this.MAIN_GUILD_ID || !this.DEST_ROLE_ID) {
      logger.error('[TagService] Missing MAIN_GUILD_ID/DEST_ROLE_ID. Listener not started.');
      return;
    }

    // Auto-fallback: if the configured tag guild is not accessible, use MAIN as source in this environment
    try {
      if (this.TAG_GUILD_ID) {
        const tagGuild = await this._fetchGuild(this.TAG_GUILD_ID);
        if (!tagGuild) {
          logger.warn({ configured: this.TAG_GUILD_ID, fallback: this.MAIN_GUILD_ID }, '[TagService] Not in TAG_GUILD; falling back to MAIN_GUILD as tag source');
          this.TAG_GUILD_ID = this.MAIN_GUILD_ID;
        }
      } else {
        this.TAG_GUILD_ID = this.MAIN_GUILD_ID;
        logger.warn('[TagService] TAG_GUILD_ID not set; using MAIN_GUILD as tag source');
      }
    } catch (e) {
      logger.warn({ err: e }, '[TagService] tag guild probe failed; using MAIN_GUILD as tag source');
      this.TAG_GUILD_ID = this.MAIN_GUILD_ID;
    }
    this.client.on('guildMemberUpdate', (o, n) => this._onGuildMemberUpdate(o, n));
    this.client.on('guildMemberAdd',    (m)    => this._onGuildMemberAdd(m));
    this.client.on('guildMemberRemove', (m)    => this._onGuildMemberRemove(m));
    if (DEBUG_RAW) {
      this.client.on('raw', (pkt) => {
        if (pkt?.t === 'GUILD_MEMBER_UPDATE') {
          logger.info({ guild_id: pkt.d?.guild_id, user_id: pkt.d?.user?.id }, '[TagService] RAW GUILD_MEMBER_UPDATE');
        }
      });
    }
    logger.info('[TagService] listeners registered');
  }

  async _fetchGuild(id) {
    try { return await this.client.guilds.fetch(id); }
    catch (err) { logger.error({ err, id }, '[TagService] cannot fetch guild'); return null; }
  }
  async _fetchMember(guildId, userId) {
    const g = await this._fetchGuild(guildId);
    if (!g) return null;
    try { return await g.members.fetch(userId); }
    catch (err) { logv('fetch member failed', { guildId, userId, err: err?.message }); return null; }
  }
  async _fetchAllMembers(guildId) {
    const g = await this._fetchGuild(guildId);
    if (!g) return null;
    try { return await g.members.fetch(); }
    catch (err) { logger.error({ err, guildId }, '[TagService] fetch all members failed'); return null; }
  }

  async _addRoleInMain(userId, reason) {
    const m = await this._fetchMember(this.MAIN_GUILD_ID, userId);
    if (!m) { logv('skip add (user not in MAIN)', { userId }); return false; }
    try {
      await m.roles.add(this.DEST_ROLE_ID, reason);
      logger.info({ userId, reason }, '[TagService] added role in MAIN');
      await maybeUpdateStats(this.client);
      return true;
    } catch (err) {
      logger.error({ err, userId }, '[TagService] add role failed');
      return false;
    }
  }
  async _removeRoleInMain(userId, reason) {
    const m = await this._fetchMember(this.MAIN_GUILD_ID, userId);
    if (!m) { logv('skip remove (user not in MAIN)', { userId }); return false; }
    try {
      await m.roles.remove(this.DEST_ROLE_ID, reason);
      logger.info({ userId, reason }, '[TagService] removed role in MAIN');
      await maybeUpdateStats(this.client);
      return true;
    } catch (err) {
      logger.error({ err, userId }, '[TagService] remove role failed');
      return false;
    }
  }

  // Idempotent enforcement: reflect tag state 1:1 to MAIN guild role
  async _ensureMainRole(userId, shouldHave) {
    const freshMain = await this._fetchMember(this.MAIN_GUILD_ID, userId);
    if (!freshMain) { logger.debug({ userId }, '[TagService] ensure: not in MAIN guild'); return false; }
    const hasRole = !!freshMain.roles.cache.has(this.DEST_ROLE_ID);

    if (shouldHave && !hasRole) {
      return this._addRoleInMain(userId, 'tag mirror (ensure)');
    }
    if (!shouldHave && hasRole) {
      return this._removeRoleInMain(userId, 'tag mirror (ensure)');
    }

    logger.debug({ userId, shouldHave, hasRole }, '[TagService] ensure: no change');
    return false;
  }

  async _onGuildMemberUpdate(_oldM, newM) {
    try {
      if (!newM?.guild) return;
      logger.info({ guildId: newM.guild.id, userId: newM.id }, '[TagService] guildMemberUpdate received');
      if (!this.TAG_GUILD_ID) { logv('no TAG_GUILD_ID configured; ignore'); return; }
      if (newM.guild.id !== this.TAG_GUILD_ID) { logv('update from non-TAG guild, ignoring', { guildId: newM.guild.id }); return; }
      const freshTag = await this._fetchMember(this.TAG_GUILD_ID, newM.id);
      if (!freshTag) { logger.warn({ userId: newM.id }, '[TagService] cannot refetch member in TAG guild'); return; }
      const hasTagNow = freshTag.roles.cache.has(this.TAG_ROLE_ID);
      logger.info({ userId: newM.id, hasTagNow }, '[TagService] tag state (TAG guild) -> enforce in MAIN');
      await this._ensureMainRole(newM.id, hasTagNow);
    } catch (err) {
      logger.error({ err }, '[TagService] onGuildMemberUpdate error');
    }
  }
  async _onGuildMemberAdd(member) {
    try {
      if (member.guild.id !== this.TAG_GUILD_ID) return;
      logger.info({ userId: member.id }, '[TagService] guildMemberAdd (TAG guild)');
      const fresh = await this._fetchMember(this.TAG_GUILD_ID, member.id);
      const has = !!fresh?.roles.cache.has(this.TAG_ROLE_ID);
      await this._ensureMainRole(member.id, has);
    } catch (err) {
      logger.error({ err }, '[TagService] onGuildMemberAdd error');
    }
  }
  async _onGuildMemberRemove(member) {
    try {
      if (member.guild.id !== this.TAG_GUILD_ID) return;
      logger.info({ userId: member.id }, '[TagService] guildMemberRemove (TAG guild)');
      await this._ensureMainRole(member.id, false);
    } catch (err) {
      logger.error({ err }, '[TagService] onGuildMemberRemove error');
    }
  }

  async getLiveTagSet() {
    const tagMembers = await this._fetchAllMembers(this.TAG_GUILD_ID);
    const set = new Set();
    if (!tagMembers) return set;
    for (const [, m] of tagMembers) if (m.roles.cache.has(this.TAG_ROLE_ID)) set.add(m.id);
    logv('getLiveTagSet result', { count: set.size });
    return set;
  }
  async getLiveTagCount() {
    const set = await this.getLiveTagSet();
    return set.size;
  }
  async syncOne(userId) {
    const tagM  = await this._fetchMember(this.TAG_GUILD_ID,  userId);
    const mainM = await this._fetchMember(this.MAIN_GUILD_ID, userId);
    if (!mainM) { logger.warn({ userId }, '[TagService] syncOne: user not in MAIN guild'); return false; }
    const hasTag  = !!tagM?.roles.cache.has(this.TAG_ROLE_ID);
    const hasRole = mainM.roles.cache.has(this.DEST_ROLE_ID);
    logger.info({ userId, hasTag, hasRole }, '[TagService] syncOne state');
    if (hasTag && !hasRole) return this._addRoleInMain(userId, 'tag-sync (user)');
    if (!hasTag && hasRole) return this._removeRoleInMain(userId, 'tag-sync (user)');
    return false;
  }
  async bulkSync() {
    const res = { checked: 0, toAdd: 0, toRemove: 0, added: 0, removed: 0, skipped: 0 };
    const mainMembers = await this._fetchAllMembers(this.MAIN_GUILD_ID);
    const tagSet = await this.getLiveTagSet();
    if (!mainMembers) return res;
    for (const [, m] of mainMembers) {
      res.checked++;
      const hasTag = tagSet.has(m.id);
      const hasRole = m.roles.cache.has(this.DEST_ROLE_ID);
      if (hasTag && !hasRole) {
        res.toAdd++;
        try { await m.roles.add(this.DEST_ROLE_ID, 'tag-sync (bulk)'); res.added++; }
        catch (err) { logger.error({ err, userId: m.id }, '[TagService] bulk add failed'); }
      } else if (!hasTag && hasRole) {
        res.toRemove++;
        try { await m.roles.remove(this.DEST_ROLE_ID, 'tag-sync (bulk)'); res.removed++; }
        catch (err) { logger.error({ err, userId: m.id }, '[TagService] bulk remove failed'); }
      } else {
        res.skipped++;
      }
    }
    logger.info({ ...res }, '[TagService] bulk sync summary');
    await maybeUpdateStats(this.client);
    return res;
  }
}

export default TagService;


