import { commandCooldownsConfig } from '../config/configLoader.js';
import { getCooldownDuration } from '../utils/cooldownStorage.js';

const inMemory = new Map();

export function isStaffExempt(member) {
  const cfg = commandCooldownsConfig();
  if (!cfg?.staffExemptions?.enabled) return false;
  const staffRoles = cfg.staffExemptions.roles || [];
  return member.roles.cache.some(r => staffRoles.includes(r.id));
}

export function getEffectiveMinutes(commandName) {
  const dynamic = getCooldownDuration(commandName);
  return dynamic || null;
}

export function check(member, commandName) {
  if (isStaffExempt(member)) return { onCooldown: false };
  const minutes = getEffectiveMinutes(commandName);
  if (!minutes) return { onCooldown: false };
  const userId = member.id;
  const userMap = inMemory.get(userId) || new Map();
  const last = userMap.get(commandName);
  if (!last) return { onCooldown: false };
  const remaining = minutes * 60 * 1000 - (Date.now() - last);
  return remaining > 0 ? { onCooldown: true, remainingTime: remaining } : { onCooldown: false };
}

export function set(member, commandName) {
  const minutes = getEffectiveMinutes(commandName);
  if (!minutes) return;
  const userId = member.id;
  if (!inMemory.has(userId)) inMemory.set(userId, new Map());
  inMemory.get(userId).set(commandName, Date.now());
}

export function formatRemaining(remainingMs) {
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}


