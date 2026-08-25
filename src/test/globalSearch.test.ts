// ===== Application-Wide Global Search Regression =====

import { describe, expect, it } from 'vitest';
import {
  searchGlobalContent,
  shouldIncludeSupportTickets,
} from '../services/search/globalSearch';
import {
  normalizeSearchTerm,
  splitHighlightedSegments,
} from '../services/search/searchMatching';
import { installMockQdnBridge } from './helpers/mockQdnBridge';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';

const OWNER = QUC_SYSOP_ADDRESS;
const OWNER_NAME = 'iffi_vaba_mees';

const postPayload = {
  schemaVersion: 1,
  resourceFamily: 'qucp-post',
  entityId: 'post0001',
  title: 'Canonical Post',
  content: 'Searchable post body',
  summary: 'Searchable summary',
  tags: ['announcement'],
  ownerName: OWNER_NAME,
  ownerAddress: OWNER,
  createdAt: 1700000000000,
};

const wikiPayload = {
  schemaVersion: 1,
  resourceFamily: 'qucp-wiki',
  entityId: 'wiki0001',
  categoryId: 'general',
  title: 'Knowledge Base',
  slug: 'knowledge-base',
  content: 'Searchable wiki content',
  summary: 'Searchable wiki summary',
  tags: [],
  ownerName: OWNER_NAME,
  ownerAddress: OWNER,
  createdAt: 1700000000000,
  revision: 1,
  status: 'active',
};

const supportPayload = {
  schemaVersion: 1,
  resourceFamily: 'qucp-support-ticket',
  entityId: 'ticket001',
  title: 'Private support issue',
  description: 'Restricted search body',
  type: 'bug',
  userPriority: 'medium',
  categoryId: 'category001',
  ownerName: OWNER_NAME,
  ownerAddress: OWNER,
  createdAt: 1700000000000,
};

function installSearchBridge(includeSupport = false) {
  return installMockQdnBridge({
    searchResults: (payload) => {
      const identifier = String(payload.identifier);
      if (identifier === 'qucp-post-') {
        return [{
          name: OWNER_NAME,
          service: 'DOCUMENT',
          identifier: 'qucp-post-post0001',
          created: 1700000000000,
        }];
      }
      if (identifier === 'qucp-wiki-') {
        return [{
          name: OWNER_NAME,
          service: 'DOCUMENT',
          identifier: 'qucp-wiki-wiki0001',
          created: 1700000000000,
        }];
      }
      if (includeSupport && identifier === 'qucp-support-ticket-') {
        return [{
          name: OWNER_NAME,
          service: 'DOCUMENT',
          identifier: 'qucp-support-ticket-ticket001',
          created: 1700000000000,
        }];
      }
      return [];
    },
    fetch: (payload) => {
      const identifier = String(payload.identifier);
      if (identifier === 'qucp-post-post0001') return postPayload;
      if (identifier === 'qucp-wiki-wiki0001') return wikiPayload;
      if (identifier === 'qucp-support-ticket-ticket001') return supportPayload;
      return null;
    },
  });
}

describe('global search matching and highlighting', () => {
  it('normalizes case and splits safe highlight segments without HTML injection', () => {
    expect(normalizeSearchTerm('  KNOWLEDGE  ')).toBe('knowledge');

    const segments = splitHighlightedSegments('Knowledge Base', 'edge');
    expect(segments).toEqual([
      { text: 'Knowl', matched: false },
      { text: 'edge', matched: true },
      { text: ' Base', matched: false },
    ]);
    expect(JSON.stringify(segments)).not.toContain('<mark>');
  });

  it('returns empty results without searching for an empty query', async () => {
    const response = await searchGlobalContent('   ', {
      isAuthenticated: true,
      currentAddress: OWNER,
      role: 'SysOp',
    });

    expect(response.query).toBe('');
    expect(response.results).toEqual([]);
    expect(response.complete).toBe(true);
    expect(response.degraded).toBe(false);
  });

  it('searches multiple canonical domains with case-insensitive matching and navigation metadata', async () => {
    const bridge = installSearchBridge();

    try {
      const response = await searchGlobalContent('KNOWLEDGE', {
        isAuthenticated: true,
        currentAddress: OWNER,
        role: 'SysOp',
      });

      const domains = response.results.map((result) => result.domain).sort();
      expect(domains).toContain('wiki');

      const wiki = response.results.find((result) => result.domain === 'wiki');
      expect(wiki).toBeDefined();
      expect(wiki?.title).toBe('Knowledge Base');
      expect(wiki?.href).toBe('/wiki/article/wiki0001');
    } finally {
      bridge.cleanup();
    }
  });

  it('does not expose Support results to unauthenticated search', async () => {
    expect(shouldIncludeSupportTickets({ isAuthenticated: false })).toBe(false);

    const bridge = installSearchBridge(true);
    try {
      const response = await searchGlobalContent('private', {
        isAuthenticated: false,
        currentAddress: null,
        role: 'User',
      });

      expect(response.results.some((result) => result.domain === 'support-ticket')).toBe(false);
    } finally {
      bridge.cleanup();
    }
  });
});
