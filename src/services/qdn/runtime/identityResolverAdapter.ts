// ===== Runtime Identity Resolver Adapter =====
//
// Connects the foundation IdentityResolver to the actual Qortium bridge.
// Uses GET_NAME_DATA bridge action to resolve QDN names to wallet addresses.

import { IdentityResolver, type NameLookupFn } from '../IdentityResolver';
import type { QdnFetchFn } from '../fetchQdnResources';

// ---- Name Lookup via Bridge ----

/**
 * Create a NameLookupFn that resolves QDN names to wallet addresses
 * via the Qortium bridge's GET_NAME_DATA action.
 *
 * The bridge returns name data including the owner address.
 * Returns null if the name does not exist or cannot be resolved.
 */
export function createBridgeNameLookup(
  bridgeQdnFetch: QdnFetchFn,
): NameLookupFn {
  return async (name: string): Promise<string | null> => {
    // Failures must propagate as failures. Returning null here would collapse
    // a bridge/Core failure into an authoritative "unresolved" identity and
    // then cache that false result for the unresolved TTL. Identity lookups
    // must only be "unresolved" when the name genuinely has no owner mapping.
    const raw = await bridgeQdnFetch({
      service: 'GET_NAME_DATA',
      name,
      identifier: name,
    });

    if (raw === null || raw === undefined) return null;

    if (typeof raw !== 'object') {
      throw new Error(
        `Invalid GET_NAME_DATA response for "${name}": expected object, got ${typeof raw}`,
      );
    }

    const data = raw as Record<string, unknown>;

    // Name data from Core has 'owner' (wallet address) or 'ownerAddress'
    return (
      typeof data.owner === 'string' ? data.owner
      : typeof data.ownerAddress === 'string' ? data.ownerAddress
      : typeof data.registeredOwner === 'string' ? data.registeredOwner
      : null
    );
  };
}

// ---- Singleton Resolver ----

let _resolver: IdentityResolver | null = null;

/**
 * Get or create the singleton IdentityResolver instance.
 * Uses the bridge fetch function for production, or can be injected for testing.
 */
export function getIdentityResolver(
  bridgeFetch?: QdnFetchFn,
): IdentityResolver {
  if (!_resolver) {
    if (!bridgeFetch) {
      throw new Error(
        'IdentityResolver not initialized: provide bridgeFetch on first call.',
      );
    }
    _resolver = new IdentityResolver(createBridgeNameLookup(bridgeFetch));
  }
  return _resolver;
}

/**
 * Reset the singleton resolver (for testing).
 */
export function resetIdentityResolver(): void {
  _resolver = null;
}
