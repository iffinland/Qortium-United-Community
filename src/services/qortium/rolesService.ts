// ===== Qortium Roles Service =====
//
// Role registry stored as a QDN resource.
// Roles are assigned by wallet address.
// Hierarchy: SysOp → SuperAdmin → Admin → Moderator → Creator → Member
//
// QDN pattern: Published under the current user's registered QDN name.
// Fetched via SEARCH_QDN_RESOURCES with prefix filter to find
// the latest registry regardless of which name it was published under.

import { requestQortium, isQortiumBridgeAvailable, getOwnerName } from './qortiumClient';
import { getUserAccount } from './walletService';
import type { RoleRegistry, UserRole } from '../../types';

const PRIMARY_SYSOP_ADDRESS = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const ROLE_REGISTRY_CACHE_TTL_MS = 60 * 1000;
const ROLE_IDENTIFIER = 'quc-roles';

type RoleRegistryPayload = {
  version: 1;
  type: 'role-registry';
  updatedAt: number;
  registry: {
    primarySysOpAddress?: string;
    superAdminAddress?: string;
    sysOps?: string[];
    admins: string[];
    moderators: string[];
    creators: string[];
  };
};

interface CachedRegistry {
  value: RoleRegistry | null;
  cachedAt: number;
  inflight: Promise<RoleRegistry> | null;
}

const registryCache: CachedRegistry = {
  value: null,
  cachedAt: 0,
  inflight: null,
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeAddressList = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v && v !== PRIMARY_SYSOP_ADDRESS && !seen.has(v) && seen.add(v));
};

const parseRoleRegistry = (raw: unknown): RoleRegistryPayload | null => {
  if (!isObject(raw) || raw.type !== 'role-registry' || !isObject(raw.registry))
    return null;

  return {
    version: 1,
    type: 'role-registry',
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    registry: {
      primarySysOpAddress:
        typeof raw.registry.primarySysOpAddress === 'string'
          ? raw.registry.primarySysOpAddress.trim() || PRIMARY_SYSOP_ADDRESS
          : typeof raw.registry.superAdminAddress === 'string'
            ? raw.registry.superAdminAddress.trim() || PRIMARY_SYSOP_ADDRESS
            : PRIMARY_SYSOP_ADDRESS,
      sysOps: normalizeAddressList(raw.registry.sysOps),
      admins: normalizeAddressList(raw.registry.admins),
      moderators: normalizeAddressList(raw.registry.moderators),
      creators: normalizeAddressList(raw.registry.creators),
    },
  };
};

/**
 * Create the default (empty) role registry.
 */
export const createDefaultRoleRegistry = (): RoleRegistry => ({
  primarySysOpAddress: PRIMARY_SYSOP_ADDRESS,
  sysOps: [],
  admins: [],
  moderators: [],
  creators: [],
  updatedAt: null,
});

/**
 * Fetch the role registry from QDN via search.
 * Searches for any resource with identifier matching 'quc-roles',
 * then fetches the first valid one.
 * Falls back to default if unavailable.
 */
export const fetchRoleRegistry = async (): Promise<RoleRegistry> => {
  const now = Date.now();
  if (
    registryCache.value &&
    now - registryCache.cachedAt < ROLE_REGISTRY_CACHE_TTL_MS
  ) {
    return registryCache.value;
  }

  if (registryCache.inflight) return registryCache.inflight;

  registryCache.inflight = (async (): Promise<RoleRegistry> => {
    // Try searching QDN for any published role registry
    if (isQortiumBridgeAvailable()) {
      try {
        const searchResults = await requestQortium<unknown[]>({
          action: 'SEARCH_QDN_RESOURCES',
          service: 'DOCUMENT',
          identifier: ROLE_IDENTIFIER,
          prefix: true,
          mode: 'ALL',
          reverse: true,
          limit: 20,
          offset: 0,
        });

        if (Array.isArray(searchResults)) {
          for (const item of searchResults) {
            if (!item || typeof item !== 'object') continue;
            const r = item as Record<string, unknown>;
            const name = typeof r.name === 'string' ? r.name : '';
            const identifier = typeof r.identifier === 'string' ? r.identifier : '';
            if (!name || !identifier) continue;

            try {
              const raw = await requestQortium<unknown>({
                action: 'FETCH_QDN_RESOURCE',
                service: 'DOCUMENT',
                name,
                identifier,
              });
              const parsed = parseRoleRegistryResponse(raw);
              if (parsed) {
                registryCache.value = parsed;
                registryCache.cachedAt = Date.now();
                return parsed;
              }
            } catch {
              // Try next result
            }
          }
        }
      } catch {
        // Search failed, fall through to fallback
      }
    }

    // Fallback: try hardcoded name (backward compatibility)
    try {
      const raw = await requestQortium<unknown>({
        action: 'FETCH_QDN_RESOURCE',
        service: 'DOCUMENT',
        name: 'qortium-united-community',
        identifier: ROLE_IDENTIFIER,
      });
      const parsed = parseRoleRegistryResponse(raw);
      if (parsed) {
        registryCache.value = parsed;
        registryCache.cachedAt = Date.now();
        return parsed;
      }
    } catch {
      /* fall through */
    }

    const fallback = createDefaultRoleRegistry();
    registryCache.value = fallback;
    registryCache.cachedAt = Date.now();
    return fallback;
  })()
    .catch(() => {
      const fallback = createDefaultRoleRegistry();
      registryCache.value = fallback;
      registryCache.cachedAt = Date.now();
      return fallback;
    })
    .finally(() => {
      registryCache.inflight = null;
    });

  return registryCache.inflight;
};

/**
 * Determine the user's role based on their address and the registry.
 */
export const getUserRole = (
  address: string,
  registry: RoleRegistry
): UserRole => {
  if (!address) return 'Member';

  if (address === registry.primarySysOpAddress) return 'SysOp';
  if (registry.sysOps.includes(address)) return 'SysOp';
  if (registry.admins.includes(address)) return 'Admin';
  if (registry.moderators.includes(address)) return 'Moderator';
  if (registry.creators.includes(address)) return 'Creator';
  return 'Member';
};

/**
 * Get the current user's role. Combines account fetch + registry lookup.
 */
export const getCurrentUserRole = async (): Promise<{
  address: string;
  role: UserRole;
}> => {
  const account = await getUserAccount();
  const registry = await fetchRoleRegistry();
  return {
    address: account.address,
    role: getUserRole(account.address, registry),
  };
};

/** Encode JSON as base64 (UTF-8 safe, following Discussion-Boards pattern). */
const encodeBase64Json = (value: unknown): string => {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

/** Parse raw QDN response that may be JSON, base64-encoded JSON, or double-encoded. */
const parseJsonLike = (raw: unknown): unknown => {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { /* not JSON */ }
  try { return JSON.parse(atob(raw)); } catch { /* not base64 JSON */ }
  try { const once = atob(raw); return JSON.parse(atob(once)); } catch { /* not double-encoded */ }
  return raw;
};

/** Parse a role registry from a raw QDN response. Returns null if invalid. */
const parseRoleRegistryResponse = (raw: unknown): RoleRegistry | null => {
  const parsed = parseJsonLike(raw);
  if (!parsed || typeof parsed !== 'object') return null;

  const payload = parseRoleRegistry(parsed);
  if (!payload) return null;

  return {
    primarySysOpAddress: payload.registry.primarySysOpAddress!,
    sysOps: payload.registry.sysOps ?? [],
    admins: payload.registry.admins ?? [],
    moderators: payload.registry.moderators ?? [],
    creators: payload.registry.creators ?? [],
    updatedAt: payload.updatedAt,
  };
};

/**
 * Publish the role registry to QDN under the current user's registered name.
 * Follows Discussion-Boards pattern exactly:
 *   1. Normalize all address lists (trim, dedup, exclude PrimarySysOp)
 *   2. Cross-filter: admins must not be in sysOps, moderators not in admins+sysOps, etc.
 *   3. Publish to QDN
 *   4. Verify by re-fetching and parsing the published resource
 *   5. Throw if verification fails
 */
export const publishRoleRegistry = async (
  registry: RoleRegistry
): Promise<RoleRegistry> => {
  const updatedAt = Date.now();
  const ownerName = await getOwnerName();
  console.log('[rolesService] Publishing role registry under name:', ownerName);

  // Step 1: Normalize all lists
  const normalizedSysOps = normalizeAddressList(registry.sysOps);
  const normalizedAdmins = normalizeAddressList(registry.admins);
  const normalizedModerators = normalizeAddressList(registry.moderators);
  const normalizedCreators = normalizeAddressList(registry.creators);

  // Step 2: Cross-filter (same order as Discussion-Boards)
  const sanitized: RoleRegistry = {
    primarySysOpAddress: PRIMARY_SYSOP_ADDRESS,
    sysOps: normalizedSysOps,
    admins: normalizedAdmins.filter((a) => !normalizedSysOps.includes(a)),
    moderators: normalizedModerators.filter(
      (a) => !normalizedAdmins.includes(a) && !normalizedSysOps.includes(a)
    ),
    creators: normalizedCreators.filter(
      (a) => !normalizedModerators.includes(a) && !normalizedAdmins.includes(a) && !normalizedSysOps.includes(a)
    ),
    updatedAt,
  };

  // Step 3: Build payload
  const payload = {
    version: 1,
    type: 'role-registry',
    updatedAt,
    registry: {
      primarySysOpAddress: sanitized.primarySysOpAddress,
      sysOps: sanitized.sysOps,
      admins: sanitized.admins,
      moderators: sanitized.moderators,
      creators: sanitized.creators,
    },
  };

  // Step 4: Publish
  await requestQortium({
    action: 'PUBLISH_QDN_RESOURCE',
    service: 'DOCUMENT',
    name: ownerName,
    identifier: ROLE_IDENTIFIER,
    title: 'Qortium United Community role registry',
    description: 'Community role registry',
    filename: 'quc-roles.json',
    data64: encodeBase64Json(payload),
  });

  // Step 5: Verify by re-fetching and checking content (max 8 retries, 2s apart)
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const raw = await requestQortium<unknown>({
        action: 'FETCH_QDN_RESOURCE',
        service: 'DOCUMENT',
        name: ownerName,
        identifier: ROLE_IDENTIFIER,
      });
      const parsed = parseRoleRegistryResponse(raw);
      if (parsed && parsed.updatedAt === updatedAt) {
        // Content matches — success!
        console.log('[rolesService] Verified: content matches, updatedAt:', updatedAt);
        break;
      }
      if (parsed) {
        console.log('[rolesService] Content mismatch, retrying... parsed.updatedAt:', parsed.updatedAt, 'expected:', updatedAt);
      }
    } catch (err) {
      console.log('[rolesService] Verification fetch failed, retrying...', err);
    }
    if (attempt < 8) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Update cache
  registryCache.value = sanitized;
  registryCache.cachedAt = Date.now();

  return sanitized;
};
