import { mirrorSingleUser } from '../services/tagService.js';
import logger from '../utils/logger.js';
import { rolesConfig } from '../config/configLoader.js';

export const name = 'guildMemberUpdate';
export const once = false;

function getIds() {
  const roles = rolesConfig();
  return {
    TAG_GUILD_ID: roles.tagSourceGuildId || roles.tagGuildId || null,
    TAG_GUILD_ROLE_ID: roles.tagSourceRoleId || null
  };
}

export async function execute(oldMember, newMember) {
  try {
    const { TAG_GUILD_ID, TAG_GUILD_ROLE_ID } = getIds();
    if (!TAG_GUILD_ID || !TAG_GUILD_ROLE_ID) {
      logger.warn('[TagEvent] TAG_GUILD_ID/TAG_GUILD_ROLE_ID missing; skip');
      return;
    }
    if (newMember.guild.id !== TAG_GUILD_ID) {
      logger.debug({ guildId: newMember.guild.id }, '[TagEvent] guild mismatch; skip');
      return;
    }

    const had = oldMember?.roles?.cache?.has(TAG_GUILD_ROLE_ID) ?? false;
    const has = newMember.roles.cache.has(TAG_GUILD_ROLE_ID);
    logger.info({ userId: newMember.id, had, has }, '[TagEvent] guildMemberUpdate role delta');
    if (had === has) return;

    await mirrorSingleUser(newMember.client, newMember.id, has);
  } catch {}
}


