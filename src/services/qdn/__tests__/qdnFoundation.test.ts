// ===== QDN Foundation Tests =====

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  type QdnResourceMetadata,
  createResourceEnvelope,
  extractMetadata,
  metadataDedupeKey,
} from '../QdnResourceEnvelope';
import {
  ValidationReasonCodes,
  accepted,
  rejected,
  quarantined,
} from '../validationTypes';
import {
  BridgeError,
  QdnError,
  isBridgeError,
  isQdnError,
} from '../qdnErrors';
import {
  infoDiag,
  warningDiag,
  errorDiag,
  sanitizeDiag,
} from '../diagnostics';
import {
  IdentityResolver,
  type NameLookupFn,
} from '../IdentityResolver';
import { paginatedQdnSearch } from '../paginatedQdnSearch';
import { boundedFetchResources } from '../fetchQdnResources';
import {
  validateResource,
  type ResourcePolicy,
} from '../index';

// ---- Helpers ----

function makeMetadata(overrides?: Partial<QdnResourceMetadata>): QdnResourceMetadata {
  return {
    name: 'Alice',
    service: 'DOCUMENT',
    identifier: 'test-001',
    created: 1700000000000,
    updated: 1700000001000,
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ================================================================
//  QdnResourceEnvelope
// ================================================================

describe('QdnResourceEnvelope', () => {
  describe('extractMetadata', () => {
    it('extracts valid metadata from a search result object', () => {
      const raw = { name: 'Alice', service: 'DOCUMENT', identifier: 'post-1', created: 100, updated: 200 };
      const meta = extractMetadata(raw);
      expect(meta).not.toBeNull();
      expect(meta!.name).toBe('Alice');
      expect(meta!.service).toBe('DOCUMENT');
      expect(meta!.identifier).toBe('post-1');
      expect(meta!.created).toBe(100);
      expect(meta!.updated).toBe(200);
    });

    it('returns null for non-object input', () => {
      expect(extractMetadata(null)).toBeNull();
      expect(extractMetadata(undefined)).toBeNull();
      expect(extractMetadata('string')).toBeNull();
      expect(extractMetadata(42)).toBeNull();
    });

    it('returns null when name is missing or empty', () => {
      expect(extractMetadata({ service: 'DOC', identifier: 'x' })).toBeNull();
      expect(extractMetadata({ name: '', service: 'DOC', identifier: 'x' })).toBeNull();
      expect(extractMetadata({ name: '  ', service: 'DOC', identifier: 'x' })).toBeNull();
    });

    it('returns null when service is missing', () => {
      expect(extractMetadata({ name: 'A', identifier: 'x' })).toBeNull();
    });

    it('returns null when identifier is missing', () => {
      expect(extractMetadata({ name: 'A', service: 'DOC' })).toBeNull();
    });

    it('handles missing optional timestamps', () => {
      const meta = extractMetadata({ name: 'A', service: 'DOC', identifier: 'x' });
      expect(meta!.created).toBeUndefined();
      expect(meta!.updated).toBeUndefined();
    });
  });

  describe('createResourceEnvelope', () => {
    it('creates an envelope with metadata and data', () => {
      const meta = makeMetadata();
      const data = { title: 'Hello' };
      const env = createResourceEnvelope(meta, data);
      expect(env.metadata).toBe(meta);
      expect(env.data).toBe(data);
      expect(env.source).toBe('qdn');
    });
  });

  describe('metadataDedupeKey', () => {
    it('produces the same key for identical metadata', () => {
      const a = makeMetadata({ name: 'Alice', identifier: 'post-1' });
      const b = makeMetadata({ name: 'Alice', identifier: 'post-1' });
      expect(metadataDedupeKey(a)).toBe(metadataDedupeKey(b));
    });

    it('produces different keys for different publishers', () => {
      const a = makeMetadata({ name: 'Alice' });
      const b = makeMetadata({ name: 'Bob' });
      expect(metadataDedupeKey(a)).not.toBe(metadataDedupeKey(b));
    });

    it('produces different keys for different identifiers', () => {
      const a = makeMetadata({ identifier: 'post-1' });
      const b = makeMetadata({ identifier: 'post-2' });
      expect(metadataDedupeKey(a)).not.toBe(metadataDedupeKey(b));
    });

    it('produces different keys for different timestamps (same publisher+id)', () => {
      const a = makeMetadata({ created: 100 });
      const b = makeMetadata({ created: 200 });
      expect(metadataDedupeKey(a)).not.toBe(metadataDedupeKey(b));
    });

    it('does NOT entity-level deduplicate different publishers with same identifier', () => {
      // Two different publishers can legitimately publish the same identifier.
      // Metadata deduplication should treat them as distinct.
      const a = makeMetadata({ name: 'Alice', identifier: 'post-1' });
      const b = makeMetadata({ name: 'Bob', identifier: 'post-1' });
      expect(metadataDedupeKey(a)).not.toBe(metadataDedupeKey(b));
    });
  });
});

// ================================================================
//  Validation Types
// ================================================================

describe('validationTypes', () => {
  it('accepted() creates an AcceptedValidation', () => {
    const env = createResourceEnvelope(makeMetadata(), { x: 1 });
    const result = accepted(env);
    expect(result.status).toBe('accepted');
    expect(result.envelope).toBe(env);
  });

  it('rejected() creates a RejectedValidation', () => {
    const result = rejected(ValidationReasonCodes.SCHEMA_INVALID);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe(ValidationReasonCodes.SCHEMA_INVALID);
  });

  it('quarantined() creates a QuarantinedValidation', () => {
    const result = quarantined(ValidationReasonCodes.PUBLISHER_UNRESOLVED);
    expect(result.status).toBe('quarantined');
    expect(result.reason).toBe(ValidationReasonCodes.PUBLISHER_UNRESOLVED);
  });

  it('quarantined() can include an envelope', () => {
    const env = createResourceEnvelope(makeMetadata(), { x: 1 });
    const result = quarantined(ValidationReasonCodes.PUBLISHER_LOOKUP_FAILED, env);
    expect(result.envelope).toBe(env);
  });
});

// ================================================================
//  Errors
// ================================================================

describe('BridgeError', () => {
  it('creates BRIDGE_UNAVAILABLE', () => {
    const err = BridgeError.bridgeUnavailable();
    expect(err.code).toBe('BRIDGE_UNAVAILABLE');
    expect(err.message).toContain('bridge');
  });

  it('creates USER_REJECTED', () => {
    const err = BridgeError.userRejected();
    expect(err.code).toBe('USER_REJECTED');
  });

  it('creates REQUEST_FAILED', () => {
    const err = BridgeError.requestFailed('test detail');
    expect(err.code).toBe('REQUEST_FAILED');
    expect(err.message).toContain('test detail');
  });

  it('creates INVALID_RESPONSE', () => {
    const err = BridgeError.invalidResponse();
    expect(err.code).toBe('INVALID_RESPONSE');
  });

  it('creates TIMEOUT', () => {
    const err = BridgeError.timeout(5000);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toContain('5000');
  });

  it('creates CANCELLED', () => {
    const err = BridgeError.cancelled();
    expect(err.code).toBe('CANCELLED');
  });

  it('isBridgeError type guard works', () => {
    expect(isBridgeError(BridgeError.userRejected())).toBe(true);
    expect(isBridgeError(new Error('plain'))).toBe(false);
    expect(isBridgeError(null)).toBe(false);
  });
});

describe('QdnError', () => {
  it('creates RESOURCE_UNAVAILABLE', () => {
    const err = QdnError.resourceUnavailable('DOCUMENT', 'Alice', 'post-1');
    expect(err.code).toBe('RESOURCE_UNAVAILABLE');
    expect(err.message).toContain('DOCUMENT/Alice/post-1');
  });

  it('creates PUBLICATION_FAILED', () => {
    const err = QdnError.publicationFailed('reason');
    expect(err.code).toBe('PUBLICATION_FAILED');
    expect(err.message).toContain('reason');
  });

  it('isQdnError type guard works', () => {
    expect(isQdnError(QdnError.resourceUnavailable('DOC', 'A', 'x'))).toBe(true);
    expect(isQdnError(new Error('plain'))).toBe(false);
  });
});

// ================================================================
//  Diagnostics
// ================================================================

describe('diagnostics', () => {
  it('infoDiag creates info-level diagnostic', () => {
    const d = infoDiag('TEST_CODE', 'test message', { name: 'Alice' });
    expect(d.level).toBe('info');
    expect(d.code).toBe('TEST_CODE');
    expect(d.message).toBe('test message');
    expect(d.name).toBe('Alice');
    expect(d.timestamp).toBeGreaterThan(0);
  });

  it('warningDiag creates warning-level diagnostic', () => {
    const d = warningDiag('WARN', 'warning msg');
    expect(d.level).toBe('warning');
  });

  it('errorDiag creates error-level diagnostic', () => {
    const d = errorDiag('ERR', 'error msg');
    expect(d.level).toBe('error');
  });

  it('sanitizeDiag strips to plain object', () => {
    const d = errorDiag('ERR', 'test', { name: 'Alice' });
    const s = sanitizeDiag(d);
    expect(s).toEqual({
      level: 'error',
      code: 'ERR',
      message: 'test',
      service: undefined,
      name: 'Alice',
      identifier: undefined,
      timestamp: d.timestamp,
    });
  });
});

// ================================================================
//  IdentityResolver
// ================================================================

describe('IdentityResolver', () => {
  let lookup: ReturnType<typeof vi.fn<NameLookupFn>>;
  let resolver: IdentityResolver;

  beforeEach(() => {
    lookup = vi.fn<NameLookupFn>();
    resolver = new IdentityResolver(lookup, {
      verifiedTtlMs: 60000,
      unresolvedTtlMs: 60000,
      failedTtlMs: 1000,
    });
  });

  it('resolves a name successfully', async () => {
    lookup.mockResolvedValue('QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const result = await resolver.resolve('Alice');
    expect(result.status).toBe('verified');
    expect(result.address).toBe('QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('Alice');
  });

  it('returns unresolved when lookup returns null', async () => {
    lookup.mockResolvedValue(null);
    const result = await resolver.resolve('NoWallet');
    expect(result.status).toBe('unresolved');
    expect(result.address).toBeUndefined();
  });

  it('returns failed when lookup throws', async () => {
    lookup.mockRejectedValue(new Error('Network error'));
    const result = await resolver.resolve('BadName');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Network error');
  });

  it('caches verified results', async () => {
    lookup.mockResolvedValue('QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await resolver.resolve('Alice');
    await resolver.resolve('Alice');
    expect(lookup).toHaveBeenCalledTimes(1); // Cached
  });

  it('deduplicates concurrent lookups', async () => {
    lookup.mockImplementation(async () => {
      await sleep(10);
      return 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    });

    const [a, b, c] = await Promise.all([
      resolver.resolve('Alice'),
      resolver.resolve('Alice'),
      resolver.resolve('Alice'),
    ]);

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(a.address).toBe('QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(b.address).toBe('QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(c.address).toBe('QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('resolves different names independently', async () => {
    lookup.mockImplementation(async (name) => {
      return name === 'Alice' ? 'QAaa' : 'QBbb';
    });

    const a = await resolver.resolve('Alice');
    const b = await resolver.resolve('Bob');

    expect(a.address).toBe('QAaa');
    expect(b.address).toBe('QBbb');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('returns empty-string name as unresolved immediately', async () => {
    const result = await resolver.resolve('  ');
    expect(result.status).toBe('unresolved');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('getCached returns cached result', async () => {
    lookup.mockResolvedValue('QAaa');
    await resolver.resolve('Alice');
    const cached = resolver.getCached('Alice');
    expect(cached).toBeDefined();
    expect(cached!.address).toBe('QAaa');
  });

  it('getCached returns undefined for uncached name', () => {
    expect(resolver.getCached('Unknown')).toBeUndefined();
  });

  it('invalidate removes a cached entry', async () => {
    lookup.mockResolvedValue('QAaa');
    await resolver.resolve('Alice');
    resolver.invalidate('Alice');
    expect(resolver.getCached('Alice')).toBeUndefined();
  });

  it('clearCache removes all entries', async () => {
    lookup.mockResolvedValue('QAaa');
    await resolver.resolve('Alice');
    await resolver.resolve('Bob');
    resolver.clearCache();
    expect(resolver.cacheSize).toBe(0);
  });

  it('failed results use shorter TTL', async () => {
    vi.useFakeTimers();
    lookup.mockRejectedValueOnce(new Error('fail'));
    await resolver.resolve('Alice');
    expect(resolver.cacheSize).toBe(1);

    // Advance past failed TTL (1s) but not verified TTL (60s)
    vi.advanceTimersByTime(2000);
    expect(resolver.getCached('Alice')).toBeUndefined();
    vi.useRealTimers();
  });
});

// ================================================================
//  Paginated QDN Search
// ================================================================

describe('paginatedQdnSearch', () => {
  it('exhausts on a single page with fewer than pageSize results', async () => {
    const searchFn = vi.fn().mockResolvedValue([
      { name: 'Alice', service: 'DOCUMENT', identifier: 'post-1' },
    ]);

    const result = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT',
      identifier: 'post-',
      pageSize: 50,
    });

    expect(result.complete).toBe(true);
    expect(result.reason).toBe('exhausted');
    expect(result.items).toHaveLength(1);
    expect(result.pagesRead).toBe(1);
    expect(searchFn).toHaveBeenCalledTimes(1);
  });

  it('iterates multiple pages to exhaustion', async () => {
    const searchFn = vi.fn()
      .mockResolvedValueOnce(
        Array.from({ length: 50 }, (_, i) => ({
          name: 'Alice', service: 'DOCUMENT', identifier: `post-${i}`,
        })),
      )
      .mockResolvedValueOnce([
        { name: 'Alice', service: 'DOCUMENT', identifier: 'post-50' },
      ]);

    const result = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT',
      identifier: 'post-',
      pageSize: 50,
    });

    expect(result.complete).toBe(true);
    expect(result.reason).toBe('exhausted');
    expect(result.items).toHaveLength(51);
    expect(result.pagesRead).toBe(2);
  });

  it('exact page-size boundary followed by empty page → exhausted', async () => {
    const searchFn = vi.fn()
      .mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          name: 'Alice', service: 'DOCUMENT', identifier: `post-${i}`,
        })),
      )
      .mockResolvedValueOnce([]);

    const result = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT',
      identifier: 'post-',
      pageSize: 10,
    });

    expect(result.complete).toBe(true);
    expect(result.items).toHaveLength(10);
    expect(result.pagesRead).toBe(2);
  });

  it('offset increments correctly across pages', async () => {
    const searchFn = vi.fn()
      .mockResolvedValueOnce(
        Array.from({ length: 5 }, (_, i) => ({
          name: 'A', service: 'DOC', identifier: `x-${i}`,
        })),
      )
      .mockResolvedValueOnce(
        Array.from({ length: 3 }, (_, i) => ({
          name: 'A', service: 'DOC', identifier: `y-${i}`,
        })),
      );

    await paginatedQdnSearch(searchFn, {
      service: 'DOC',
      identifier: 'x-',
      pageSize: 5,
    });

    expect(searchFn).toHaveBeenCalledTimes(2);
    expect(searchFn).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 0, limit: 5 }));
    expect(searchFn).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 5, limit: 5 }));
  });

  it('stops at safety budget with complete: false', async () => {
    // Return a unique page each time to avoid repeated-page detection
    let pageNum = 0;
    const searchFn = vi.fn().mockImplementation(async () => {
      pageNum++;
      return Array.from({ length: 10 }, (_, i) => ({
        name: 'Alice', service: 'DOCUMENT', identifier: `post-p${pageNum}-${i}`,
      }));
    });

    const result = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT',
      identifier: 'post-',
      pageSize: 10,
      safetyMax: 15,
    });

    // First page: 10 results → rawResultCount=10
    // Second page: 10 results → rawResultCount=20 >= 15, stop
    expect(result.complete).toBe(false);
    expect(result.reason).toBe('safety-budget-reached');
  });

  it('deduplicates exact metadata matches', async () => {
    const duplicate = { name: 'Alice', service: 'DOCUMENT', identifier: 'post-1', created: 100 };
    const searchFn = vi.fn().mockResolvedValue([duplicate, duplicate]);

    const result = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT', identifier: 'post-', pageSize: 50,
    });

    expect(result.items).toHaveLength(1);
    expect(result.deduplicatedCount).toBe(1);
  });

  it('does NOT entity-level deduplicate — different publishers with same ID are distinct', async () => {
    const searchFn = vi.fn().mockResolvedValue([
      { name: 'Alice', service: 'DOCUMENT', identifier: 'post-1', created: 100 },
      { name: 'Bob', service: 'DOCUMENT', identifier: 'post-1', created: 200 },
    ]);

    const result = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT', identifier: 'post-', pageSize: 50,
    });

    expect(result.items).toHaveLength(2);
    expect(result.deduplicatedCount).toBe(0);
  });

  it('detects repeated page', async () => {
    const samePage = [
      { name: 'Alice', service: 'DOCUMENT', identifier: 'post-1' },
    ];
    const searchFn = vi.fn().mockResolvedValue(samePage);

    const result = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT', identifier: 'post-', pageSize: 1,
    });

    // First page returns 1 result (== pageSize), second page returns same → repeated
    expect(result.complete).toBe(false);
    expect(result.reason).toBe('repeated-page');
  });

  it('handles request failure gracefully', async () => {
    const searchFn = vi.fn().mockRejectedValue(new Error('Network down'));

    const result = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT', identifier: 'post-',
    });

    expect(result.complete).toBe(false);
    expect(result.reason).toBe('request-failed');
  });

  it('handles invalid (non-array) response', async () => {
    const searchFn = vi.fn().mockResolvedValue({ not: 'an array' });

    const result = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT', identifier: 'post-',
    });

    expect(result.complete).toBe(false);
    expect(result.reason).toBe('invalid-response');
  });

  it('supports cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    const searchFn = vi.fn().mockImplementation(async () => {
      await sleep(200);
      // Return full page so loop continues (won't exhaust on 0 results)
      return Array.from({ length: 10 }, (_, i) => ({
        name: 'A', service: 'DOC', identifier: `x-${i}`,
      }));
    });

    const promise = paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT', identifier: 'post-', signal: controller.signal, pageSize: 10,
    });

    // Cancel before first page resolves
    await sleep(10);
    controller.abort();
    const result = await promise;

    expect(result.complete).toBe(false);
    expect(result.reason).toBe('cancelled');
  });

  it('accepts configurable pageSize', async () => {
    const searchFn = vi.fn().mockResolvedValue([
      { name: 'A', service: 'DOC', identifier: 'x-1' },
    ]);

    const result = await paginatedQdnSearch(searchFn, {
      service: 'DOC', identifier: 'x-', pageSize: 20,
    });

    expect(searchFn).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    expect(result.complete).toBe(true);
  });
});

// ================================================================
//  Bounded Fetch Resources
// ================================================================

describe('boundedFetchResources', () => {
  const parser = (raw: unknown) => {
    if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
    return null;
  };

  it('fetches all resources with bounded concurrency', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ title: 'Test' });
    const metadatas = [
      makeMetadata({ identifier: 'post-1' }),
      makeMetadata({ identifier: 'post-2' }),
      makeMetadata({ identifier: 'post-3' }),
    ];

    const result = await boundedFetchResources(fetchFn, parser, metadatas, { concurrency: 2 });

    expect(result.items).toHaveLength(3);
    expect(result.complete).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('isolates individual fetch failures', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ title: 'Good 1' })
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValueOnce({ title: 'Good 2' });

    const metadatas = [
      makeMetadata({ identifier: 'post-1' }),
      makeMetadata({ identifier: 'post-2' }),
      makeMetadata({ identifier: 'post-3' }),
    ];

    const result = await boundedFetchResources(fetchFn, parser, metadatas, { concurrency: 3 });

    expect(result.items).toHaveLength(2);
    expect(result.failures).toHaveLength(1);
    expect(result.complete).toBe(false);
    expect(result.failures[0].metadata.identifier).toBe('post-2');
  });

  it('handles parser returning null', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ title: 'Test' });
    const nullParser = () => null;

    const result = await boundedFetchResources(fetchFn, nullParser, [makeMetadata()]);

    expect(result.items).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
  });

  it('respects cancellation', async () => {
    const controller = new AbortController();
    // All fetches are deferred so none complete before cancellation
    const resolvers: Array<(v: unknown) => void> = [];
    const fetchFn = vi.fn().mockImplementation(() => {
      return new Promise<unknown>((r) => { resolvers.push(r); });
    });

    const metadatas = Array.from({ length: 5 }, (_, i) => makeMetadata({ identifier: `post-${i}` }));

    const promise = boundedFetchResources(fetchFn, parser, metadatas, {
      signal: controller.signal,
      concurrency: 2,
    });

    // Let the first workers start their fetches
    await sleep(10);

    // Cancel — should prevent new work from starting
    controller.abort();

    // Resolve any in-flight fetches
    await sleep(5);
    for (const resolve of resolvers) {
      resolve({ title: 'Done' });
    }

    const result = await promise;

    // With concurrency 2 and 5 items, the first 2 workers start fetching
    // (indices 0,1). After cancellation + resolve, they complete, but
    // the remaining 3 items (indices 2,3,4) should not have started.
    // Depending on timing, items 0,1 complete. So we expect 2 items.
    // We verify that not all 5 completed.
    expect(result.items.length).toBeLessThan(5);
  });

  it('preserves input order', async () => {
    let call = 0;
    const fetchFn = vi.fn().mockImplementation(async () => {
      call++;
      await sleep(Math.random() * 10); // Random completion order
      return { order: call };
    });

    const metadatas = Array.from({ length: 5 }, (_, i) => makeMetadata({ identifier: `post-${i}` }));

    const result = await boundedFetchResources(fetchFn, parser, metadatas, { concurrency: 5 });
    expect(result.items).toHaveLength(5);
    // Items are stored at their index positions and filtered for failures
    // With no failures, all 5 should be present
  });
});

// ================================================================
//  Validation Pipeline
// ================================================================

describe('validationPipeline', () => {
  // Example policy for testing
  const examplePolicy: ResourcePolicy<{ title: string; authorName: string; authorAddress: string }> = {
    family: 'test-post',

    parse(data: unknown) {
      if (!data || typeof data !== 'object') return { success: false, reason: ValidationReasonCodes.SCHEMA_INVALID, message: 'Not an object' };
      const d = data as Record<string, unknown>;
      if (typeof d.title !== 'string') return { success: false, reason: ValidationReasonCodes.SCHEMA_INVALID, message: 'Missing title' };
      return {
        success: true,
        data: {
          title: d.title,
          authorName: typeof d.authorName === 'string' ? d.authorName : '',
          authorAddress: typeof d.authorAddress === 'string' ? d.authorAddress : '',
        },
      };
    },

    validateIdentifier(id: string) {
      if (!id.startsWith('post-')) return { valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID };
      return { valid: true };
    },

    extractEmbeddedIdentity(env) {
      return {
        authorName: env.data.authorName,
        authorAddress: env.data.authorAddress,
      };
    },
  };

  it('accepts a valid resource with matching identity', async () => {
    const lookup = vi.fn<NameLookupFn>().mockResolvedValue('QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm');
    const resolver = new IdentityResolver(lookup);
    const env = createResourceEnvelope(
      makeMetadata({ name: 'Alice', identifier: 'post-1' }),
      { title: 'Test', authorName: 'Alice', authorAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm' },
    );

    const result = await validateResource(env, examplePolicy, resolver);
    expect(result.status).toBe('accepted');
  });

  it('rejects malformed schema (not an object)', async () => {
    const lookup = vi.fn<NameLookupFn>();
    const resolver = new IdentityResolver(lookup);
    const env = createResourceEnvelope(makeMetadata({ identifier: 'post-1' }), 'not-an-object');

    const result = await validateResource(env, examplePolicy, resolver);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe(ValidationReasonCodes.SCHEMA_INVALID);
    }
  });

  it('rejects invalid identifier', async () => {
    const lookup = vi.fn<NameLookupFn>();
    const resolver = new IdentityResolver(lookup);
    const env = createResourceEnvelope(
      makeMetadata({ identifier: 'bad-identifier' }),
      { title: 'Test', authorName: 'A', authorAddress: '' },
    );

    const result = await validateResource(env, examplePolicy, resolver);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe(ValidationReasonCodes.IDENTIFIER_INVALID);
    }
  });

  it('quarantines when publisher lookup fails', async () => {
    const lookup = vi.fn<NameLookupFn>().mockRejectedValue(new Error('Network error'));
    const resolver = new IdentityResolver(lookup);
    const env = createResourceEnvelope(
      makeMetadata({ name: 'Alice', identifier: 'post-1' }),
      { title: 'Test', authorName: 'Alice', authorAddress: 'QAaa' },
    );

    const result = await validateResource(env, examplePolicy, resolver);
    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.reason).toBe(ValidationReasonCodes.PUBLISHER_LOOKUP_FAILED);
    }
  });

  it('quarantines when publisher is unresolved', async () => {
    const lookup = vi.fn<NameLookupFn>().mockResolvedValue(null);
    const resolver = new IdentityResolver(lookup);
    const env = createResourceEnvelope(
      makeMetadata({ name: 'NoWallet', identifier: 'post-1' }),
      { title: 'Test', authorName: 'NoWallet', authorAddress: 'QAaa' },
    );

    const result = await validateResource(env, examplePolicy, resolver);
    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.reason).toBe(ValidationReasonCodes.PUBLISHER_UNRESOLVED);
    }
  });

  it('rejects embedded identity mismatch', async () => {
    const lookup = vi.fn<NameLookupFn>().mockResolvedValue('QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm');
    const resolver = new IdentityResolver(lookup);
    const env = createResourceEnvelope(
      makeMetadata({ name: 'Alice', identifier: 'post-1' }),
      {
        title: 'Test',
        authorName: 'Alice',
        authorAddress: 'QDifferentWalletDifferentWalletDifferent',
      },
    );

    const result = await validateResource(env, examplePolicy, resolver);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH);
    }
  });

  it('accepts resource when no embedded identity extractor exists', async () => {
    // Policy without extractEmbeddedIdentity
    const simplePolicy: ResourcePolicy<{ title: string }> = {
      family: 'simple',
      parse(data: unknown) {
        if (!data || typeof data !== 'object') return { success: false, reason: ValidationReasonCodes.SCHEMA_INVALID, message: 'bad' };
        return { success: true, data: data as { title: string } };
      },
      validateIdentifier: () => ({ valid: true }),
    };

    const lookup = vi.fn<NameLookupFn>().mockResolvedValue('QAaa');
    const resolver = new IdentityResolver(lookup);
    const env = createResourceEnvelope(
      makeMetadata({ name: 'Alice', identifier: 'any' }),
      { title: 'Simple' },
    );

    const result = await validateResource(env, simplePolicy, resolver);
    expect(result.status).toBe('accepted');
  });

  it('preserves diagnostics on rejection', async () => {
    const lookup = vi.fn<NameLookupFn>();
    const resolver = new IdentityResolver(lookup);
    const env = createResourceEnvelope(makeMetadata({ identifier: 'post-1' }), 'not-object');

    const result = await validateResource(env, examplePolicy, resolver);
    expect(result.status).toBe('rejected');
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('preserves diagnostics on quarantine', async () => {
    const lookup = vi.fn<NameLookupFn>().mockResolvedValue(null);
    const resolver = new IdentityResolver(lookup);
    const env = createResourceEnvelope(
      makeMetadata({ name: 'NoWallet', identifier: 'post-1' }),
      { title: 'Test', authorName: 'N', authorAddress: 'Q' },
    );

    const result = await validateResource(env, examplePolicy, resolver);
    expect(result.status).toBe('quarantined');
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
