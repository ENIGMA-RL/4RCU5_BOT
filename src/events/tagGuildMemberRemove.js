import { mirrorSingleUser } from '../services/tagService.js';
import { rolesConfig } from '../config/configLoader.js';

export const name = 'guildMemberRemove';
export const once = false;

function getTagGuildId() {
  const roles = rolesConfig();
  return roles.tagSourceGuildId || roles.tagGuildId || null;
}

export async function execute(member) {
  try {
    const TAG_GUILD_ID = getTagGuildId();
    if (!TAG_GUILD_ID) return;
    if (member.guild.id !== TAG_GUILD_ID) return;
    await mirrorSingleUser(member.client, member.id, false);
  } catch {}
}


