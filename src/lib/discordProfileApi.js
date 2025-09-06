import logger from '../utils/logger.js';
import { fetchWithBackoff } from '../utils/fetchWithBackoff.js';

export async function fetchUserPrimaryGuild(userId, _guildId, opts = {}) {
  const token = process.env.bot_token || process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) throw new Error('bot_token missing');
  const { accessToken } = opts || {};

  const res = await fetchWithBackoff(
    accessToken ? `https://discord.com/api/users/@me` : `https://discord.com/api/users/${userId}`,
    {
      method: 'GET',
      headers: {
        authorization: accessToken ? `Bearer ${accessToken}` : `Bot ${token}`,
        'x-track': '1',
        'user-agent': 'discordbot'
      }
    },
    { name: accessToken ? 'discord:getMe' : 'discord:getUser' }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    logger.warn({ status: res.status, body: txt.slice(0, 200) }, 'profile fetch failed');
    throw new Error(`profile fetch failed ${res.status}`);
  }
  const json = await res.json();
  const pg = json?.user?.primary_guild ?? json?.primary_guild;
  return {
    identity_enabled: pg?.identity_enabled ?? null,
    identity_guild_id: pg?.identity_guild_id ?? null
  };
}

export default { fetchUserPrimaryGuild };


