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
    try {
      const raw = await bridgeQdnFetch({
        service: 'GET_NAME_DATA',
        name,
        identifier: name,
      });

      if (!raw || typeof raw !== 'object') return null;

      const data = raw as Record<string, unknown>;

      // Name data from Core has 'owner' (wallet address) or 'ownerAddress'
      const owner =
        typeof data.owner === 'string' ? data.owner
        : typeof data.ownerAddress === 'string' ? data.ownerAddress
        : typeof data.registeredOwner === 'string' ? data.registeredOwner
        : null;

      return owner;
    } catch {
      return null;
    }
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
