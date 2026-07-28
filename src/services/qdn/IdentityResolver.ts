// ===== QDN Identity Resolver =====
//
// Resolves QDN publisher names to wallet addresses using an injectable
// lookup function (typically Core GET_NAME_DATA via the bridge).
//
// Features:
//   - Caching with configurable TTLs for verified / unresolved / failed
//   - Concurrent request deduplication
//   - Manual invalidation

/** Status of a single name resolution. */
export type ResolutionStatus = 'verified' | 'unresolved' | 'failed';

/** Result of resolving one QDN name to a wallet address. */
export interface IdentityResolution {
  /** The QDN name that was resolved */
  name: string;
  /** Resolution outcome */
  status: ResolutionStatus;
  /** Resolved wallet address (only when status === 'verified') */
  address?: string;
  /** Error message (when status === 'failed') */
  error?: string;
  /** When the resolution was completed (epoch ms) */
  resolvedAt: number;
}

/**
 * Function signature for looking up a wallet address from a QDN name.
 * Injected so tests can use mocks instead of a live Core node.
 */
export type NameLookupFn = (name: string) => Promise<string | null>;

// ---- Cache entry ----

interface CacheEntry {
  resolution: IdentityResolution;
  cachedAt: number;
  ttlMs: number;
}

// ---- Resolver options ----

export interface IdentityResolverOptions {
  /** TTL for verified (successful) resolutions (ms). Default: 300_000 (5 min). */
  verifiedTtlMs?: number;
  /** TTL for unresolved (name exists but no wallet) results (ms). Default: 300_000 (5 min). */
  unresolvedTtlMs?: number;
  /** TTL for failed (lookup error) results (ms). Default: 30_000 (30 sec). */
  failedTtlMs?: number;
}

const DEFAULT_OPTIONS: Required<IdentityResolverOptions> = {
  verifiedTtlMs: 300_000,
  unresolvedTtlMs: 300_000,
  failedTtlMs: 30_000,
};

// ---- Resolver ----

export class IdentityResolver {
  private readonly lookup: NameLookupFn;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<IdentityResolution>>();
  private readonly options: Required<IdentityResolverOptions>;

  constructor(lookup: NameLookupFn, options?: IdentityResolverOptions) {
    this.lookup = lookup;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Resolve a QDN name to a wallet address.
   * Uses cache when available and fresh. Deduplicates concurrent calls.
   */
  async resolve(name: string): Promise<IdentityResolution> {
    const normalized = name.trim();
    if (!normalized) {
      return {
        name,
        status: 'unresolved',
        resolvedAt: Date.now(),
      };
    }

    // Check cache
    const cached = this.cache.get(normalized);
    if (cached && Date.now() - cached.cachedAt < cached.ttlMs) {
      return cached.resolution;
    }

    // Deduplicate concurrent lookups
    const pending = this.pending.get(normalized);
    if (pending) return pending;

    const promise = this.performLookup(normalized);
    this.pending.set(normalized, promise);

    try {
      return await promise;
    } finally {
      this.pending.delete(normalized);
    }
  }

  /** Get a cached resolution without triggering a lookup. */
  getCached(name: string): IdentityResolution | undefined {
    const normalized = name.trim();
    const entry = this.cache.get(normalized);
    if (entry && Date.now() - entry.cachedAt < entry.ttlMs) {
      return entry.resolution;
    }
    return undefined;
  }

  /** Invalidate the cache entry for a specific name. */
  invalidate(name: string): void {
    this.cache.delete(name.trim());
  }

  /** Clear the entire cache. */
  clearCache(): void {
    this.cache.clear();
    this.pending.clear();
  }

  /** Return the number of entries in the cache. */
  get cacheSize(): number {
    return this.cache.size;
  }

  private async performLookup(
    name: string,
  ): Promise<IdentityResolution> {
    const now = Date.now();

    try {
      const address = await this.lookup(name);

      const resolution: IdentityResolution = address
        ? { name, status: 'verified', address, resolvedAt: now }
        : { name, status: 'unresolved', resolvedAt: now };

      const ttlMs = address
        ? this.options.verifiedTtlMs
        : this.options.unresolvedTtlMs;

      this.cache.set(name, { resolution, cachedAt: now, ttlMs });

      return resolution;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Name lookup failed';

      const resolution: IdentityResolution = {
        name,
        status: 'failed',
        error: errorMsg,
        resolvedAt: now,
      };

      this.cache.set(name, {
        resolution,
        cachedAt: now,
        ttlMs: this.options.failedTtlMs,
      });

      return resolution;
    }
  }
}
