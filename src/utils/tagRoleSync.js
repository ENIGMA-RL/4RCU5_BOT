import fetch from 'node-fetch';

export async function syncUserTagRole(guild, userId, accessToken, cnsOfficialRoleId, tagGuildId) {
  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Track': '1',
    },
  });
  const userData = await userResponse.json();

  const tagData = userData.primary_guild;
  const isUsingTag = tagData && tagData.identity_enabled && tagData.identity_guild_id === tagGuildId;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return;
  }

  if (isUsingTag) {
    if (!member.roles.cache.has(cnsOfficialRoleId)) {
      await member.roles.add(cnsOfficialRoleId, 'Server tag enabled via OAuth');
    }
  } else {
    if (member.roles.cache.has(cnsOfficialRoleId)) {
      await member.roles.remove(cnsOfficialRoleId, 'Server tag disabled via OAuth');
    }
  }
} 