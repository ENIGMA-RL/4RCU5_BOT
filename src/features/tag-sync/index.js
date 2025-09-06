import { Events } from 'discord.js';
import { fetchUserPrimaryGuild } from '../../lib/discordProfileApi.js';
import logger from '../../utils/logger.js';
import { setCnsTagEquippedWithGuild as recordEquipped, setCnsTagUnequippedWithGuild as recordUnequipped } from '../tagSync/../repositories/tagRepo.js';

export function registerTagSync(client, { guildId, roleId }) {
  const last = new Map();

  client.on(Events.UserUpdate, async (_oldUser, newUser) => {
    try {
      const { identity_enabled, identity_guild_id } = await fetchUserPrimaryGuild(newUser.id, guildId);
      const hasTag = Boolean(identity_enabled && identity_guild_id === guildId);

      const prev = last.get(newUser.id);
      const cur = hasTag ? 1 : 0;
      if (prev === cur) return;
      last.set(newUser.id, cur);

      const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(newUser.id).catch(() => null);
      if (!member) return;
      const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId);
      if (!role) return;

      if (hasTag && !member.roles.cache.has(role.id)) {
        await member.roles.add(role, 'server tag equipped');
        try { recordEquipped(member.id, guildId); } catch {}
        logger.info(`Tag equipped → role added for ${member.user.tag}`);
      } else if (!hasTag && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, 'server tag removed');
        try { recordUnequipped(member.id, guildId); } catch {}
        logger.info(`Tag removed → role removed for ${member.user.tag}`);
      }
    } catch (e) {
      logger.error({ err: e }, 'tag-sync userupdate error');
    }
  });
}

export default { registerTagSync };


