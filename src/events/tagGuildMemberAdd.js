import { mirrorSingleUser } from '../services/tagService.js';
import { rolesConfig } from '../config/configLoader.js';

export const name = 'guildMemberAdd';
export const once = false;

function getIds() {
  const roles = rolesConfig();
  return {
    TAG_GUILD_ID: roles.tagSourceGuildId || roles.tagGuildId || null,
    TAG_GUILD_ROLE_ID: roles.tagSourceRoleId || null
  };
}

export async function execute(member) {
  try {
    const { TAG_GUILD_ID, TAG_GUILD_ROLE_ID } = getIds();
    if (!TAG_GUILD_ID || !TAG_GUILD_ROLE_ID) return;
    if (member.guild.id !== TAG_GUILD_ID) return;
    const has = member.roles.cache.has(TAG_GUILD_ROLE_ID);
    if (has) await mirrorSingleUser(member.client, member.id, true);
  } catch {}
}


