// ===== Repair Round 3 — M4 Global Search Degradation =====
//
// Global search must preserve per-domain status and never convert an
// unavailable/incomplete domain into a false "No matching content" state.

import { describe, expect, it } from 'vitest';
import { searchGlobalContent } from '../services/search/globalSearch';
import { installMockQdnBridge } from './helpers/mockQdnBridge';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';

const OWNER = QUC_SYSOP_ADDRESS;
const OWNER_NAME = 'iffi_vaba_mees';

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

type SearchHandler = (payload: Record<string, unknown>) => unknown[];

function installSearchBridge(
  searchResults: SearchHandler,
  fetch?: (payload: Record<string, unknown>) => unknown,
) {
  return installMockQdnBridge({
    searchResults,
    fetch,
  });
}

function allEmpty(): SearchHandler {
  return () => [];
}

function projectUnavailable(wikiMatches: boolean): SearchHandler {
  return (payload) => {
    const identifier = String(payload.identifier);
    if (identifier === 'qucp-project-') {
      throw new Error('project search down');
    }
    if (wikiMatches && identifier === 'qucp-wiki-') {
      return [
        {
          name: OWNER_NAME,
          service: 'DOCUMENT',
          identifier: 'qucp-wiki-wiki0001',
          created: 1700000000000,
        },
      ];
    }
    return [];
  };
}

describe('M4: global search degradation truthfulness', () => {
  it('all domains complete with no matches -> truthful no-results', async () => {
    const bridge = installSearchBridge(allEmpty());
    try {
      const response = await searchGlobalContent('nothing', {
        isAuthenticated: true,
        currentAddress: OWNER,
        role: 'SysOp',
      });
      expect(response.results).toEqual([]);
      expect(response.complete).toBe(true);
      expect(response.degraded).toBe(false);
      expect(response.degradedDomains).toEqual([]);
    } finally {
      bridge.cleanup();
    }
  });

  it('one domain unavailable with matches elsewhere -> partial results plus indicator', async () => {
    const bridge = installSearchBridge(projectUnavailable(true), (payload) => {
      if (String(payload.identifier) === 'qucp-wiki-wiki0001') return wikiPayload;
      return null;
    });
    try {
      const response = await searchGlobalContent('knowledge', {
        isAuthenticated: true,
        currentAddress: OWNER,
        role: 'SysOp',
      });
      expect(response.results.some((r) => r.domain === 'wiki')).toBe(true);
      expect(response.degraded).toBe(true);
      expect(response.complete).toBe(false);
      expect(response.degradedDomains).toContain('project');
    } finally {
      bridge.cleanup();
    }
  });

  it('one domain unavailable with no trusted matches -> no false no-results', async () => {
    const bridge = installSearchBridge(projectUnavailable(false));
    try {
      const response = await searchGlobalContent('ghost', {
        isAuthenticated: true,
        currentAddress: OWNER,
        role: 'SysOp',
      });
      expect(response.results).toEqual([]);
      expect(response.complete).toBe(false);
      expect(response.degraded).toBe(true);
      expect(response.degradedDomains).toContain('project');
    } finally {
      bridge.cleanup();
    }
  });

  it('multiple incomplete domains are reported together', async () => {
    const handler: SearchHandler = (payload) => {
      const identifier = String(payload.identifier);
      if (identifier === 'qucp-project-' || identifier === 'qucp-event-') {
        throw new Error('domain down');
      }
      return [];
    };
    const bridge = installSearchBridge(handler);
    try {
      const response = await searchGlobalContent('x', {
        isAuthenticated: true,
        currentAddress: OWNER,
        role: 'SysOp',
      });
      expect(response.degraded).toBe(true);
      expect(response.degradedDomains.sort()).toEqual(['event', 'project']);
    } finally {
      bridge.cleanup();
    }
  });

  it('unauthenticated Support stays skipped, not degraded or leaked', async () => {
    const handler: SearchHandler = (payload) => {
      if (String(payload.identifier) === 'qucp-support-ticket-') {
        return [
          {
            name: OWNER_NAME,
            service: 'DOCUMENT',
            identifier: 'qucp-support-ticket-ticket001',
            created: 1700000000000,
          },
        ];
      }
      return [];
    };
    const bridge = installSearchBridge(handler, (payload) => {
      if (String(payload.identifier) === 'qucp-support-ticket-ticket001') {
        return supportPayload;
      }
      return null;
    });
    try {
      const response = await searchGlobalContent('private', {
        isAuthenticated: false,
        currentAddress: null,
        role: 'User',
      });
      expect(response.results.some((r) => r.domain === 'support-ticket')).toBe(false);
      expect(response.domainStatus['support-ticket']).toBe('skipped');
      expect(response.degraded).toBe(false);
    } finally {
      bridge.cleanup();
    }
  });

  it('search recovers after a transient domain failure', async () => {
    let failProject = true;
    const handler: SearchHandler = (payload) => {
      const identifier = String(payload.identifier);
      if (identifier === 'qucp-project-' && failProject) {
        throw new Error('project down');
      }
      if (identifier === 'qucp-wiki-') {
        return [
          {
            name: OWNER_NAME,
            service: 'DOCUMENT',
            identifier: 'qucp-wiki-wiki0001',
            created: 1700000000000,
          },
        ];
      }
      return [];
    };
    const bridge = installSearchBridge(handler, (payload) => {
      if (String(payload.identifier) === 'qucp-wiki-wiki0001') return wikiPayload;
      return null;
    });
    try {
      const degraded = await searchGlobalContent('knowledge', {
        isAuthenticated: true,
        currentAddress: OWNER,
        role: 'SysOp',
      });
      expect(degraded.degraded).toBe(true);
      expect(degraded.degradedDomains).toContain('project');

      failProject = false;
      const recovered = await searchGlobalContent('knowledge', {
        isAuthenticated: true,
        currentAddress: OWNER,
        role: 'SysOp',
      });
      expect(recovered.degraded).toBe(false);
      expect(recovered.results.some((r) => r.domain === 'wiki')).toBe(true);
    } finally {
      bridge.cleanup();
    }
  });
});
