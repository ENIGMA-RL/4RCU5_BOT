import { rolesConfig } from '../config/configLoader.js';

export function isAdmin(member) {
  const cfg = rolesConfig();
  const ids = cfg.adminRoles || [];
  return member.roles.cache.some(r => ids.includes(r.id));
}

export function isMod(member) {
  const cfg = rolesConfig();
  const ids = cfg.modRoles || [];
  return member.roles.cache.some(r => ids.includes(r.id));
}

export function hasStaff(member) {
  const cfg = rolesConfig();
  const ids = (cfg.adminRoles || []).concat(cfg.modRoles || []).concat(cfg.helperRole ? [cfg.helperRole] : []);
  return member.roles.cache.some(r => ids.includes(r.id));
}


