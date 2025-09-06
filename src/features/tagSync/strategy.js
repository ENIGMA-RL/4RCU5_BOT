import { rolesConfig } from '../../config/configLoader.js';
import { fetchWithBackoff } from '../../utils/fetchWithBackoff.js';

/**
 * Bot token strategy: query users via bot token
 */
export async function botTokenHasTag({ userId, client }) {
  const res = await fetchWithBackoff(
    `https://discord.com/api/users/${userId}`,
    { headers: { Authorization: `Bot ${client.token}`, 'X-Track': '1' } },
    { name: 'discord:getUser' }
  );
  if (!res.ok) return { ok: false, isUsingTag: false };
  const userData = await res.json();
  const tagData = userData.primary_guild;
  const tagGuildId = rolesConfig().tagGuildId;
  const isUsingTag = Boolean(tagData && tagData.identity_enabled && tagData.identity_guild_id === tagGuildId);
  return { ok: true, isUsingTag, tagData, userData };
}

/**
 * OAuth strategy: minimal wrapper – the caller must provide accessToken
 */
export async function oauthHasTag({ accessToken }) {
  const res = await fetchWithBackoff(
    'https://discord.com/api/users/@me',
    { headers: { Authorization: `Bearer ${accessToken}`, 'X-Track': '1' } },
    { name: 'discord:getMe' }
  );
  if (!res.ok) return { ok: false, isUsingTag: false };
  const userData = await res.json();
  const tagData = userData.primary_guild;
  const tagGuildId = rolesConfig().tagGuildId;
  const isUsingTag = Boolean(tagData && tagData.identity_enabled && tagData.identity_guild_id === tagGuildId);
  return { ok: true, isUsingTag, tagData, userData };
}


