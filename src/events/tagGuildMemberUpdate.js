import { mirrorSingleUser } from '../services/tagService.js';

export const name = 'guildMemberUpdate';
export const once = false;

const TAG_GUILD_ID = process.env.TAG_GUILD_ID;
const TAG_GUILD_ROLE_ID = process.env.TAG_GUILD_ROLE_ID;

export async function execute(oldMember, newMember) {
  try {
    if (!TAG_GUILD_ID || !TAG_GUILD_ROLE_ID) return;
    if (newMember.guild.id !== TAG_GUILD_ID) return;

    const had = oldMember?.roles?.cache?.has(TAG_GUILD_ROLE_ID) ?? false;
    const has = newMember.roles.cache.has(TAG_GUILD_ROLE_ID);
    if (had === has) return;

    await mirrorSingleUser(newMember.client, newMember.id, has);
  } catch {}
}


