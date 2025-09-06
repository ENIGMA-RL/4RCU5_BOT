import logger from './logger.js';

// Fetches all guild members and returns a Collection of members that hold a given role
export async function fetchRoleHolders(guild, roleId) {
  try {
    await guild.members.fetch();
  } catch (e) {
    logger.error({ err: e }, 'Failed to fetch guild members for fetchRoleHolders');
  }
  const role = guild.roles.cache.get(roleId);
  if (!role) return [];
  return guild.members.cache.filter(m => m.roles.cache.has(roleId));
}


