import fetch from 'node-fetch';
import { ApplicationCommandOptionType } from 'discord.js';
import logger from '../../utils/logger.js';
import { rolesConfig } from '../../config/configLoader.js';

const cfg = rolesConfig();
const MAIN_GUILD_ID   = process.env.GUILD_ID || cfg.mainGuildId || cfg.main_guild_id;
const OFFICIAL_ROLE_ID = cfg.cnsOfficialRole || cfg.cns_official_role;
const TAG_GUILD_ID     = cfg.tagGuildId || cfg.tagSourceGuildId || MAIN_GUILD_ID;

export async function checkHasServerTag(userId, client) {
  const res = await fetch(`https://discord.com/api/users/${userId}`, {
    headers: { Authorization: `Bot ${client.token}` },
  });
  if (!res.ok) throw new Error(`discord /users/${userId} → ${res.status}`);
  const data = await res.json();
  const pg = data?.primary_guild;
  const has = !!(pg && pg.identity_enabled && pg.identity_guild_id === TAG_GUILD_ID);
  return { has, pg };
}

export async function syncUserTagRoleSimple(guild, userId, client) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { ok: false, error: 'member_not_found' };

  const { has } = await checkHasServerTag(userId, client);
  const already = member.roles.cache.has(OFFICIAL_ROLE_ID);

  if (has && !already) {
    await member.roles.add(OFFICIAL_ROLE_ID, 'simple tag sync');
    return { ok: true, action: 'added' };
  }
  if (!has && already) {
    await member.roles.remove(OFFICIAL_ROLE_ID, 'simple tag sync');
    return { ok: true, action: 'removed' };
  }
  return { ok: true, action: 'no_change' };
}

export function wireSimpleTagSync(client) {
  client.on('presenceUpdate', async (_o, n) => {
    try {
      const userId = n?.user?.id || n?.userId; if (!userId) return;
      const g = await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null); if (!g) return;
      const r = await syncUserTagRoleSimple(g, userId, client);
      logger.info({ userId, ...r }, '[SimpleTag] presence');
    } catch (e) {
      logger.error({ err: e }, '[SimpleTag] presence failed');
    }
  });

  client.on('interactionCreate', async (i) => {
    if (!i.isChatInputCommand()) return;
    if (i.commandName !== 'tag-sync') return;
    if (i.guildId !== MAIN_GUILD_ID) return;
    await i.deferReply({ ephemeral: true });
    const user = i.options.getUser('user') || i.user;
    try {
      const r = await syncUserTagRoleSimple(i.guild, user.id, client);
      await i.editReply(r.ok ? `simple tag sync → ${r.action}` : `❌ ${r.error}`);
    } catch (e) {
      await i.editReply(`❌ failed: ${e.message}`);
    }
  });

  client.once('ready', async () => {
    try {
      const guild = await client.guilds.fetch(MAIN_GUILD_ID);
      await guild.commands.create({
        name: 'tag-sync',
        description: 'Simple tag sync',
        options: [
          { name: 'user', description: 'User', type: ApplicationCommandOptionType.User, required: false },
        ],
      });
      logger.info('[SimpleTag] /tag-sync registered');
    } catch (e) {
      logger.error({ err: e }, '[SimpleTag] register failed');
    }
  });
}

export default { wireSimpleTagSync, syncUserTagRoleSimple };


