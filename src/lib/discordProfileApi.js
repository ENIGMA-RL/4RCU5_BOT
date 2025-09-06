import logger from '../utils/logger.js';
import { fetchWithBackoff } from '../utils/fetchWithBackoff.js';

function buildXTrack() {
  try {
    const payload = {
      os: 'Windows',
      browser: 'Chrome',
      release_channel: 'stable',
      client_version: '1.0.0',
      client_build_number: 999999,
      client_event_source: null
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  } catch {}
  return 'e30=';
}

export async function fetchUserPrimaryGuild(userId, guildId) {
  const token = process.env.bot_token || process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) throw new Error('bot_token missing');
  const url = `https://discord.com/api/v10/users/${userId}/profile?with_mutual_guilds=true&guild_id=${guildId}`;
  const res = await fetchWithBackoff(
    url,
    {
      method: 'GET',
      headers: {
        authorization: `Bot ${token}`,
        'x-track': buildXTrack(),
        'user-agent': 'discordbot'
      }
    },
    { name: 'discord:profile' }
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


