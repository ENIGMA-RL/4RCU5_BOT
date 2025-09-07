import logger from '../../utils/logger.js';
import { rolesConfig } from '../../config/configLoader.js';
import { syncUserTagRole, syncAllUserTags, clearTagStatusCache } from '../tagSync/tagSyncService.js';

export function wireTagSync(client) {
  const { cnsOfficialRole } = rolesConfig();
  const MAIN_GUILD_ID = process.env.GUILD_ID || rolesConfig().mainGuildId || rolesConfig().main_guild_id;

  if (!MAIN_GUILD_ID || !cnsOfficialRole) {
    logger.error({ MAIN_GUILD_ID, cnsOfficialRole }, '[TagWire] Missing GUILD_ID or cnsOfficialRole');
    return;
  }

  const getMainGuild = async () => client.guilds.fetch(MAIN_GUILD_ID).catch(() => null);

  (async () => {
    const g = await getMainGuild();
    if (!g) return;
    try { await g.roles.fetch(); } catch {}
    const role = g.roles.cache.get(cnsOfficialRole);
    const me = await g.members.fetch(client.user.id).catch(() => null);
    const canManage = !!(me && role && me.roles?.highest?.position > role?.position);
    logger.info({
      guildId: MAIN_GUILD_ID,
      officialRole: cnsOfficialRole,
      botHighest: me?.roles?.highest?.id,
      rolePosOk: canManage
    }, '[TagWire] Role hierarchy check');
  })();

  // Presence-driven sync (force refresh, no cache)
  client.on('presenceUpdate', async (_oldP, newP) => {
    try {
      const userId = newP?.user?.id || newP?.userId;
      if (!userId) return;
      const g = await getMainGuild(); if (!g) return;
      clearTagStatusCache(userId);
      const res = await syncUserTagRole(userId, g, client, { forceRefresh: true });
      logger.info({ userId, res }, '[TagWire] presence→syncUserTagRole');
    } catch (err) {
      logger.error({ err }, '[TagWire] presence handler failed');
    }
  });

  // Slash command passthrough: tag-sync / tagsync
  client.on('interactionCreate', async (i) => {
    try {
      if (!i.isChatInputCommand()) return;
      if (i.commandName !== 'tag-sync' && i.commandName !== 'tagsync') return;
      const g = i.guild; if (!g) return;
      if (g.id !== MAIN_GUILD_ID) return;
      await i.deferReply({ ephemeral: true });

      const doAll =
        i.options.getBoolean?.('all') === true ||
        i.options.getSubcommand?.(false) === 'all' ||
        i.options.getString?.('type') === 'all';

      if (doAll) {
        const r = await syncAllUserTags(g, client);
        await i.editReply(`Bulk tag sync: processed=${r.processed} ok=${r.successCount} errors=${r.errorCount}`);
        return;
      }

      const target = i.options.getUser('user') || i.user;
      clearTagStatusCache(target.id);
      const res = await syncUserTagRole(target.id, g, client, { forceRefresh: true });
      await i.editReply(res.success
        ? `Tag sync voor ${res.user || target.tag || target.id} → ${res.action} (${res.reason || '—'})`
        : `❌ Tag sync error: ${res.error || 'unknown'}`
      );
    } catch (err) {
      logger.error({ err }, '[TagWire] /tag-sync failed');
      try {
        if (i.deferred || i.replied) await i.editReply('❌ Tag sync crashed; check logs.');
        else await i.reply({ ephemeral: true, content: '❌ Tag sync crashed; check logs.' });
      } catch {}
    }
  });
}

export default { wireTagSync };


