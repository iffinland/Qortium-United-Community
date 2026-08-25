// ===== Repair Round 3 — H3 Result-State Integrity =====
//
// Infrastructure failures must never collapse into a valid-looking empty
// domain. These tests exercise the shared validated query runtime plus the
// identity resolver recovery path.

import { describe, expect, it, vi } from 'vitest';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import { validatedRuntimeQuery } from '../services/qdn/runtime/validatedQueryRuntime';
import { postPolicy } from '../services/qdn/policies/postPolicy';
import { buildPostPayload } from '../services/qdn/runtime/postRuntime';
import type { QucpPost } from '../services/qdn/schemas/postSchema';

const WALLET = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const NAME = 'alice';

function meta(id: string, name = NAME, created = 1000) {
  return {
    name,
    service: 'DOCUMENT',
    identifier: `qucp-post-${id}`,
    created,
    updated: created,
  };
}

function payload(id: string, name = NAME, addr = WALLET): QucpPost {
  return buildPostPayload({
    entityId: id,
    title: `Title ${id}`,
    content: 'Content',
    ownerName: name,
    ownerAddress: addr,
    now: 1700000000000,
  });
}

function parse(raw: unknown): QucpPost | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as QucpPost;
}

function verifiedResolver(nameToAddr: Record<string, string>) {
  return new IdentityResolver(async (name) => nameToAddr[name] ?? null);
}

function run(
  searchFn: () => Promise<unknown[]>,
  fetchFn: (p: { service: string; name: string; identifier: string }) => Promise<unknown>,
  resolver: IdentityResolver,
  overrides: Partial<{ pageSize: number; safetyMax: number }> = {},
) {
  return validatedRuntimeQuery<QucpPost>(
    searchFn,
    fetchFn,
    parse,
    postPolicy,
    resolver,
    {
      service: 'DOCUMENT',
      identifierPrefix: 'qucp-post-',
      pageSize: overrides.pageSize,
      safetyMax: overrides.safetyMax,
    },
  );
}

describe('H3: infrastructure failure must not become valid empty data', () => {
  it('valid zero-result discovery is empty', async () => {
    const result = await run(
      async () => [],
      async () => payload('post0001'),
      verifiedResolver({ [NAME]: WALLET }),
    );
    expect(result.status).toBe('empty');
  });

  it('complete discovery with only schema-rejected resources is empty', async () => {
    const result = await run(
      async () => [meta('badentry')],
      async () => ({ resourceFamily: 'qucp-post' }),
      verifiedResolver({ [NAME]: WALLET }),
    );
    expect(result.status).toBe('empty');
  });

  it('all resource fetches fail -> unavailable', async () => {
    const result = await run(
      async () => [meta('post0001'), meta('post0002')],
      async () => {
        throw new Error('fetch failed');
      },
      verifiedResolver({ [NAME]: WALLET }),
    );
    expect(result.status).toBe('unavailable');
  });

  it('some resource fetches fail -> incomplete with remaining items', async () => {
    const result = await run(
      async () => [meta('post0001'), meta('post0002')],
      async ({ identifier }) => {
        if (identifier === 'qucp-post-post0001') return payload('post0001');
        throw new Error('fetch failed');
      },
      verifiedResolver({ [NAME]: WALLET }),
    );
    expect(result.status).toBe('incomplete');
    if (result.status === 'incomplete') {
      expect(result.items.map((item) => item.entityId)).toEqual(['post0001']);
    }
  });

  it('identity lookup throws -> unavailable, not empty', async () => {
    const resolver = new IdentityResolver(async () => {
      throw new Error('identity infrastructure down');
    });
    const result = await run(
      async () => [meta('post0001')],
      async () => payload('post0001'),
      resolver,
    );
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toMatch(/identity infrastructure/i);
    }
  });

  it('identity failure recovers after the failed-cache TTL', async () => {
    vi.useFakeTimers();
    try {
      const lookup = vi
        .fn()
        .mockRejectedValueOnce(new Error('transient failure'))
        .mockResolvedValueOnce(WALLET);
      const resolver = new IdentityResolver(lookup, {
        failedTtlMs: 100,
        verifiedTtlMs: 60_000,
        unresolvedTtlMs: 60_000,
      });

      const first = await resolver.resolve(NAME);
      expect(first.status).toBe('failed');

      // Inside the failed TTL the failure is cached and not re-attempted.
      const cached = await resolver.resolve(NAME);
      expect(cached.status).toBe('failed');
      expect(lookup).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(101);

      const recovered = await resolver.resolve(NAME);
      expect(recovered.status).toBe('verified');
      expect(recovered.address).toBe(WALLET);
      expect(lookup).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('partial discovery is incomplete, not complete', async () => {
    let offset = 0;
    const searchFn = vi.fn().mockImplementation(async () => {
      const id = `post${String(offset).padStart(4, '0')}`;
      offset += 1;
      return [meta(id)];
    });

    const result = await run(
      searchFn,
      async ({ identifier }) => payload(identifier.replace('qucp-post-', '')),
      verifiedResolver({ [NAME]: WALLET }),
      { pageSize: 1, safetyMax: 1 },
    );

    expect(result.status).toBe('incomplete');
  });
});
