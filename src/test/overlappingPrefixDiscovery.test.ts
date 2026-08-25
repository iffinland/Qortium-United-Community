// ===== Repair Round 3 — M1 Overlapping Identifier Prefix Discovery =====
//
// `qucp-post-` (parent posts) is a prefix of `qucp-post-comment-` (child
// comments). The reader-side discovery filter must stop child resources from
// consuming the parent family's result budget.

import { describe, expect, it } from 'vitest';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import { queryPosts } from '../services/qdn/runtime/postRuntime';
import { buildPostPayload } from '../services/qdn/runtime/postRuntime';

const WALLET = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const NAME = 'alice';

interface Record {
  name: string;
  service: string;
  identifier: string;
  created: number;
  updated: number;
}

function parent(id: number): Record {
  const entityId = `post${String(id).padStart(5, '0')}`;
  return {
    name: NAME,
    service: 'DOCUMENT',
    identifier: `qucp-post-${entityId}`,
    created: id,
    updated: id,
  };
}

function child(id: number): Record {
  const entityId = `comment${String(id).padStart(5, '0')}`;
  return {
    name: NAME,
    service: 'DOCUMENT',
    identifier: `qucp-post-comment-${entityId}`,
    created: id,
    updated: id,
  };
}

describe('M1: overlapping parent/child identifier prefixes', () => {
  it('child comments do not starve parent post discovery', async () => {
    const parents = Array.from({ length: 30 }, (_, i) => parent(1000 + i));
    const children = Array.from({ length: 70 }, (_, i) => child(2000 + i));
    // Children come first, so a raw-result budget would consume the newest
    // slots and crowd out every older parent.
    const all: Record[] = [...children, ...parents];

    const searchFn = async (params: { offset: number; limit: number }) =>
      all.slice(params.offset, params.offset + params.limit);

    const fetchFn = async (params: { identifier: string }) => {
      const id = params.identifier.replace('qucp-post-', '');
      return buildPostPayload({
        entityId: id,
        title: `Post ${id}`,
        content: 'Content',
        ownerName: NAME,
        ownerAddress: WALLET,
        now: 1700000000000,
      });
    };

    const resolver = new IdentityResolver(async (name) =>
      name === NAME ? WALLET : null,
    );

    const result = await queryPosts(searchFn, fetchFn, resolver, {
      pageSize: 10,
      safetyMax: 40,
    });

    expect(result.status).toBe('complete');
    if (result.status === 'complete' || result.status === 'incomplete') {
      expect(result.items).toHaveLength(30);
      const ids = result.items.map((item) => item.entityId).sort();
      expect(ids).toEqual(parents.map((p) => p.identifier.replace('qucp-post-', '')).sort());
    }
  });

  it('still honors the matching-result safety budget', async () => {
    const parents = Array.from({ length: 60 }, (_, i) => parent(1000 + i));
    const all: Record[] = [...parents];

    const searchFn = async (params: { offset: number; limit: number }) =>
      all.slice(params.offset, params.offset + params.limit);

    const fetchFn = async (params: { identifier: string }) => {
      const id = params.identifier.replace('qucp-post-', '');
      return buildPostPayload({
        entityId: id,
        title: `Post ${id}`,
        content: 'Content',
        ownerName: NAME,
        ownerAddress: WALLET,
        now: 1700000000000,
      });
    };

    const resolver = new IdentityResolver(async (name) =>
      name === NAME ? WALLET : null,
    );

    const result = await queryPosts(searchFn, fetchFn, resolver, {
      pageSize: 10,
      safetyMax: 40,
    });

    expect(result.status).toBe('incomplete');
  });
});
