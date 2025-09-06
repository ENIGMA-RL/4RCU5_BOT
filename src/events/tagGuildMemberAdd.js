import { mirrorSingleUser } from '../services/tagService.js';

export const name = 'guildMemberAdd';
export const once = false;

const TAG_GUILD_ID = process.env.TAG_GUILD_ID;
const TAG_GUILD_ROLE_ID = process.env.TAG_GUILD_ROLE_ID;

export async function execute(member) {
  try {
    if (!TAG_GUILD_ID || !TAG_GUILD_ROLE_ID) return;
    if (member.guild.id !== TAG_GUILD_ID) return;
    const has = member.roles.cache.has(TAG_GUILD_ROLE_ID);
    if (has) await mirrorSingleUser(member.client, member.id, true);
  } catch {}
}


