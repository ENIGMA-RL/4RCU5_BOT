import { mirrorSingleUser } from '../services/tagService.js';

export const name = 'guildMemberRemove';
export const once = false;

const TAG_GUILD_ID = process.env.TAG_GUILD_ID;

export async function execute(member) {
  try {
    if (!TAG_GUILD_ID) return;
    if (member.guild.id !== TAG_GUILD_ID) return;
    await mirrorSingleUser(member.client, member.id, false);
  } catch {}
}


