import { rolesConfig } from '../config/configLoader.js';
import logger from './logger.js';

function isSnowflake(id) {
  return typeof id === 'string' && /^\d{17,20}$/.test(id);
}

function normalizeRoleIdList(roles) {
  if (!Array.isArray(roles)) return [];
  return roles
    .map((r) => (typeof r === 'string' ? r : r?.id))
    .filter((id) => typeof id === 'string' && id.length > 0);
}

function isMiscCategory(category) {
  const name = String(category?.name || '').toLowerCase();
  return name === 'misc';
}

function resolveCategoryRoleId(category) {
  const fromExplicit = category?.categoryRoleId;
  if (isSnowflake(fromExplicit)) return fromExplicit;
  const fromId = category?.id;
  if (isSnowflake(fromId)) return fromId;
  return null;
}

/**
 * Keeps role "role categories" in sync with "child roles" a member has.
 *
 * Rules:
 * - If member has any child role in a category, ensure the category role is present.
 * - If member has no child roles in a category, remove the category role.
 * - Special-case for misc: if member has exactly 1 misc child role AND no child roles from any other category, remove misc category role.
 *
 * Config shape expected (roles.json):
 * roleCategories: [{ id: "<key or roleId>", categoryRoleId: "<roleId?>", name: "misc", roles: [{ name, id }, ...] }, ...]
 */
export async function syncRoleCategoriesForMember(member, reason = 'Role category sync') {
  const cfg = rolesConfig();
  const categories = Array.isArray(cfg?.roleCategories) ? cfg.roleCategories : [];
  if (categories.length === 0) return { changed: false, added: [], removed: [] };

  const normalized = categories
    .map((c) => ({
      key: c?.id,
      categoryRoleId: resolveCategoryRoleId(c),
      name: c?.name,
      roleIds: normalizeRoleIdList(c?.roles),
      isMisc: isMiscCategory(c)
    }))
    .filter((c) => isSnowflake(c.categoryRoleId) && c.roleIds.length > 0);

  if (normalized.length === 0) return { changed: false, added: [], removed: [] };

  const memberRoles = member.roles?.cache;
  if (!memberRoles) return { changed: false, added: [], removed: [] };

  const counts = normalized.map((c) => ({
    ...c,
    activeCount: c.roleIds.reduce((acc, id) => (memberRoles.has(id) ? acc + 1 : acc), 0)
  }));

  const otherCategoriesActive = counts.some((c) => !c.isMisc && c.activeCount > 0);

  const toAdd = [];
  const toRemove = [];

  for (const c of counts) {
    const hasAny = c.activeCount > 0;
    let shouldHaveCategoryRole = hasAny;

    if (c.isMisc && hasAny) {
      if (c.activeCount === 1 && !otherCategoriesActive) {
        shouldHaveCategoryRole = false;
      }
    }

    const hasCategoryRole = memberRoles.has(c.categoryRoleId);
    if (shouldHaveCategoryRole && !hasCategoryRole) toAdd.push(c.categoryRoleId);
    if (!shouldHaveCategoryRole && hasCategoryRole) toRemove.push(c.categoryRoleId);
  }

  if (toAdd.length === 0 && toRemove.length === 0) {
    return { changed: false, added: [], removed: [] };
  }

  try {
    if (toAdd.length > 0) {
      await member.roles.add(toAdd, reason);
    }
    if (toRemove.length > 0) {
      await member.roles.remove(toRemove, reason);
    }
    return { changed: true, added: toAdd, removed: toRemove };
  } catch (err) {
    logger.error({ err, userId: member.id, guildId: member.guild?.id, toAdd, toRemove }, 'Role category sync failed');
    return { changed: false, added: [], removed: [], error: err?.message || String(err) };
  }
}

