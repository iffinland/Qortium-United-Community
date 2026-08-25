// ===== R-HIGH-2: Global Search Inherits Role-Authority Degradation =====
//
// Uses the real `searchGlobalContent` composition and the production QDN
// runtime. A role-history outage rejects an Admin-managed Post even though the
// Post search/fetch succeeded, so the Post domain must surface as unavailable
// and global search must never claim a complete "no matching content" state.

import { describe, it, expect } from 'vitest';
import { searchGlobalContent } from '../services/search/globalSearch';
import { installMockQdnBridge } from './helpers/mockQdnBridge';

const USER = 'QUuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu';

const postPayload = {
  schemaVersion: 1,
  resourceFamily: 'qucp-post',
  entityId: 'post0001',
  title: 'hello admin post',
  content: 'Searchable post content',
  summary: 'Searchable post summary',
  tags: [],
  ownerName: 'some-user',
  ownerAddress: USER,
  createdAt: 1700000000000,
};

const topicPayload = {
  schemaVersion: 1,
  resourceFamily: 'qucp-forum-topic',
  entityId: 'ft-thread0001',
  title: 'hello forum thread',
  content: 'Searchable forum content',
  categoryId: 'general',
  tags: [],
  ownerName: 'some-user',
  ownerAddress: USER,
  createdAt: 1700000000000,
};

describe('R-HIGH-2: global search inherits role-authority degradation', () => {
  it('role outage marks affected Admin domains degraded and never reports complete no-results', async () => {
    const bridge = installMockQdnBridge({
      selectedAccount: USER,
      ownerName: 'some-user',
      searchResults: (payload) => {
        const identifier = String(payload.identifier);
        if (identifier === 'qucp-rs-') {
          throw new Error('role search infrastructure down');
        }
        if (identifier === 'qucp-post-') {
          return [
            {
              name: 'some-user',
              service: 'DOCUMENT',
              identifier: 'qucp-post-post0001',
              created: 1700000000000,
              updated: 1700000000000,
            },
          ];
        }
        if (identifier === 'qucp-forum-topic-') {
          return [
            {
              name: 'some-user',
              service: 'DOCUMENT',
              identifier: 'qucp-forum-topic-ft-thread0001',
              created: 1700000000000,
              updated: 1700000000000,
            },
          ];
        }
        return [];
      },
      fetch: (payload) => {
        const identifier = String(payload.identifier);
        if (identifier === 'qucp-post-post0001') return postPayload;
        if (identifier === 'qucp-forum-topic-ft-thread0001') return topicPayload;
        return null;
      },
    });

    try {
      const response = await searchGlobalContent('hello', {
        isAuthenticated: true,
        currentAddress: USER,
        role: 'User',
      });

      expect(response.domainStatus.post).toBe('unavailable');
      expect(response.degraded).toBe(true);
      expect(response.complete).toBe(false);
      expect(response.degradedDomains).toContain('post');
      // Healthy forum domain still surfaces its valid match.
      expect(response.results.some((r) => r.domain === 'forum-topic')).toBe(true);
      // The rejected Admin-managed post must not leak into results.
      expect(response.results.some((r) => r.domain === 'post')).toBe(false);
    } finally {
      bridge.cleanup();
    }
  });

  it('zero trusted matches plus degraded role dependency is not a truthful complete no-results', async () => {
    const bridge = installMockQdnBridge({
      selectedAccount: USER,
      ownerName: 'some-user',
      searchResults: (payload) => {
        const identifier = String(payload.identifier);
        if (identifier === 'qucp-rs-') {
          throw new Error('role search infrastructure down');
        }
        if (identifier === 'qucp-post-') {
          return [
            {
              name: 'some-user',
              service: 'DOCUMENT',
              identifier: 'qucp-post-post0001',
              created: 1700000000000,
              updated: 1700000000000,
            },
          ];
        }
        return [];
      },
      fetch: (payload) => {
        if (String(payload.identifier) === 'qucp-post-post0001') return postPayload;
        return null;
      },
    });

    try {
      const response = await searchGlobalContent('ghost', {
        isAuthenticated: true,
        currentAddress: USER,
        role: 'User',
      });
      expect(response.results).toEqual([]);
      expect(response.complete).toBe(false);
      expect(response.degraded).toBe(true);
      expect(response.degradedDomains).toContain('post');
    } finally {
      bridge.cleanup();
    }
  });
});
