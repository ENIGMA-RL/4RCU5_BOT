import { handleVoiceXP } from './levelingSystem.js';
import logger from '../../utils/logger.js';

// userId -> { guildId, lastTick, eligibleMs, lastAwardedMinute }
const voiceSessionMap = new Map();

function isEligibleForVoiceXP(voiceChannel) {
  if (!voiceChannel?.members?.size) return false;
  const members = voiceChannel.members;
  const isAlone = members.size <= 1;
  const isEveryoneMuted = members.every(m => m.voice?.selfMute || m.voice?.serverMute);
  return !isAlone && !isEveryoneMuted;
}

export function onJoin(member) {
  const now = Date.now();
  voiceSessionMap.set(member.id, {
    guildId: member.guild.id,
    lastTick: now,
    eligibleMs: 0,
    lastAwardedMinute: 0
  });
}

export async function onLeave(member, oldState) {
  const session = voiceSessionMap.get(member.id);
  if (!session) return;
  try {
    const now = Date.now();
    const delta = now - session.lastTick;
    session.lastTick = now;
    const isDeaf = Boolean(oldState?.selfDeaf || oldState?.serverDeaf || member?.voice?.selfDeaf || member?.voice?.serverDeaf);
    const channel = oldState?.channel ?? (member.guild?.channels?.cache?.get(oldState?.channelId));
    const wasAlone = !channel || channel.members.size === 0;
    if (!isDeaf && !wasAlone) session.eligibleMs += delta;
    const eligibleMinutes = Math.floor(session.eligibleMs / 60000);
    const toAward = eligibleMinutes - session.lastAwardedMinute;
    for (let i = 0; i < toAward; i++) {
      // eslint-disable-next-line no-await-in-loop
      await handleVoiceXP(member);
    }
  } catch (err) {
    logger.error({ err }, 'Error finalizing voice session');
  } finally {
    voiceSessionMap.delete(member.id);
  }
}

export async function onSwitch(oldMember, newMember, oldState) {
  await onLeave(oldMember, oldState);
  onJoin(newMember);
}

export async function tick(client) {
  const now = Date.now();
  for (const [userId, session] of voiceSessionMap) {
    try {
      const guild = client.guilds.cache.get(session.guildId) || await client.guilds.fetch(session.guildId).catch(() => null);
      if (!guild) {
        voiceSessionMap.delete(userId);
        continue;
      }
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member || !member.voice?.channelId) {
        voiceSessionMap.delete(userId);
        continue;
      }
      const delta = now - session.lastTick;
      session.lastTick = now;
      const channel = member.voice.channel ?? guild.channels.cache.get(member.voice.channelId);
      const isDeaf = Boolean(member.voice.selfDeaf || member.voice.serverDeaf);
      const eligible = !isDeaf && isEligibleForVoiceXP(channel);
      if (eligible) session.eligibleMs += delta;
      const eligibleMinutes = Math.floor(session.eligibleMs / 60000);
      if (eligibleMinutes > session.lastAwardedMinute) {
        const toAward = eligibleMinutes - session.lastAwardedMinute;
        for (let i = 0; i < toAward; i++) {
          // eslint-disable-next-line no-await-in-loop
          await handleVoiceXP(member);
        }
        session.lastAwardedMinute = eligibleMinutes;
      }
    } catch (err) {
      logger.error({ err }, 'Error in voice tick');
    }
  }
}

export function clearAllSessions() {
  voiceSessionMap.clear();
}


