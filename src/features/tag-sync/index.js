import { Events } from 'discord.js';
import { fetchUserPrimaryGuild } from '../../lib/discordProfileApi.js';
import logger from '../../utils/logger.js';
import { setCnsTagEquippedWithGuild as recordEquipped, setCnsTagUnequippedWithGuild as recordUnequipped } from '../../repositories/tagRepo.js';

export function registerTagSync(client, { identityGuildId, targetGuildId, targetRoleId }) {
  const last = new Map();
  logger.info({ identityGuildId, targetGuildId, targetRoleId }, '[tag-sync] registering listeners');
  const retryAttempts = new Map();

  async function reconcileByUserId(userId) {
    try {
      const { identity_enabled, identity_guild_id } = await fetchUserPrimaryGuild(userId, identityGuildId);
      const hasTag = Boolean(identity_enabled && identity_guild_id === identityGuildId);
      logger.info({ userId, hasTag, identity_enabled, identity_guild_id, identityGuildId, targetGuildId, targetRoleId }, '[tag-sync] primary_guild result');

      const cur = hasTag ? 1 : 0;
      last.set(userId, cur);

      const guild = client.guilds.cache.get(targetGuildId) ?? await client.guilds.fetch(targetGuildId);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return;
      const role = guild.roles.cache.get(targetRoleId) ?? await guild.roles.fetch(targetRoleId);
      if (!role) return;

      if (hasTag && !member.roles.cache.has(role.id)) {
        await member.roles.add(role, 'server tag equipped');
        try { recordEquipped(member.id, targetGuildId); } catch {}
        logger.info(`Tag equipped → role added for ${member.user.tag}`);
        retryAttempts.delete(userId);
      } else if (!hasTag && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, 'server tag removed');
        try { recordUnequipped(member.id, targetGuildId); } catch {}
        logger.info(`Tag removed → role removed for ${member.user.tag}`);
        retryAttempts.delete(userId);
      } else if (!hasTag) {
        // Propagatie kan vertraagd zijn—probeer kort daarna opnieuw
        const n = (retryAttempts.get(userId) || 0) + 1;
        if (n <= 3) {
          retryAttempts.set(userId, n);
          const delay = 1500 * n;
          logger.info({ userId, attempt: n, delay }, '[tag-sync] scheduling retry due to no tag yet');
          setTimeout(() => { reconcileByUserId(userId).catch(() => {}); }, delay);
        } else {
          retryAttempts.delete(userId);
        }
      }
    } catch (e) {
      logger.error({ err: e }, 'tag-sync userupdate error');
    }
  }

  client.on(Events.UserUpdate, async (_oldUser, newUser) => {
    logger.info({ userId: newUser.id }, '[tag-sync] UserUpdate received');
    await reconcileByUserId(newUser.id);
  });

  client.on(Events.PresenceUpdate, async (_oldPresence, newPresence) => {
    const userId = newPresence?.userId || newPresence?.user?.id;
    if (!userId) return;
    logger.info({ userId }, '[tag-sync] PresenceUpdate received');
    await reconcileByUserId(userId);
  });
}

export default { registerTagSync };


