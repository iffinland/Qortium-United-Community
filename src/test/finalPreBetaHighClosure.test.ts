// ===== Final Pre-BETA HIGH Closure Tests =====
//
// These tests close the two remaining HIGH production-composition boundaries
// identified by the final targeted re-audit:
//
//   R-HIGH-1 — current-role resolution must fail closed on incomplete role
//              discovery instead of selecting a partial chain head.
//   R-HIGH-2 — a zero-resource Admin-domain query must still propagate a
//              degraded authority dependency instead of returning `empty`.
//
// Every assertion runs against real production functions (role snapshot
// selection, application authorization, Support category mutation precheck,
// the shared validated query runtime, and global search). The final
// role/result-state verdict is never replaced by a mock boolean.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import {
  getLatestRoleSnapshot,
  type RoleSnapshotQueryResult,
} from '../services/qdn/runtime/roleSnapshotRuntime';
import type { QucpRoleRegistrySnapshot } from '../services/qdn/schemas/roleRegistrySnapshotSchema';
import type { QdnResourceEnvelope } from '../services/qdn/QdnResourceEnvelope';
import {
  resolveUserRole,
  fetchAuthoritativeUserRole,
} from '../services/auth/authorization';
import { queryPosts } from '../services/qdn/runtime/postRuntime';
import {
  buildAdminRoleHistoryContext,
  createAdminAuthorityProvider,
} from '../services/qdn/roles/adminHistoricalAuthorization';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import { buildRoleSnapshotIdentifier } from '../services/qdn/identifiers/roleSnapshotIdentifiers';
import { store } from '../store';
import { supportApi } from '../store/api/supportApi';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';
import { searchGlobalContent } from '../services/search/globalSearch';

const SYSOP = QUC_SYSOP_ADDRESS;

function wallet(seed: string): string {
  const body = (
    seed + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  ).slice(0, 33);
  return `Q${body}`;
}

const ADMIN = wallet('QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const USER = wallet('QUuuuuuuuuuuuuuuuuuuuuuuuuuuuuu');
const T0 = 1787403000000;

// ---- Role Snapshot Fixtures ----

function roleData(
  snapshotId: string,
  previousSnapshotId: string | undefined,
  admins: string[],
  created = T0,
): QucpRoleRegistrySnapshot {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-role-snapshot',
    snapshotId,
    previousSnapshotId,
    sysopAddress: SYSOP,
    members: admins.map((address) => ({ address, roles: ['admin'] as const })),
    createdAt: created,
  };
}

function roleEnvelope(
  data: QucpRoleRegistrySnapshot,
  created = T0,
): QdnResourceEnvelope<QucpRoleRegistrySnapshot> {
  return {
    metadata: {
      name: 'iffi_vaba_mees',
      service: 'DOCUMENT',
      identifier: `qucp-rs-${data.snapshotId}`,
      created,
      updated: created,
    },
    data,
    source: 'qdn',
    resolvedPublisherAddress: SYSOP,
  };
}

function roleItem(data: QucpRoleRegistrySnapshot, created = T0) {
  return {
    envelope: roleEnvelope(data, created),
    entityId: data.snapshotId,
    publisherName: 'iffi_vaba_mees',
    publisherAddress: SYSOP,
  };
}

function completeRoleResult(
  snapshots: QucpRoleRegistrySnapshot[],
): RoleSnapshotQueryResult {
  return {
    status: 'complete',
    items: snapshots.map((s) => roleItem(s)),
    rejectedCount: 0,
    quarantinedCount: 0,
    diagnostics: [],
  };
}

function incompleteRoleResult(
  snapshots: QucpRoleRegistrySnapshot[],
): RoleSnapshotQueryResult {
  return {
    status: 'incomplete',
    items: snapshots.map((s) => roleItem(s)),
    rejectedCount: 0,
    quarantinedCount: 0,
    reason: 'Incomplete role snapshot discovery',
    diagnostics: [],
  };
}

// ---- Zero-resource authority dependency helpers ----

function providerFor(
  status: RoleSnapshotQueryResult['status'],
  snapshots: QucpRoleRegistrySnapshot[],
) {
  const result: RoleSnapshotQueryResult =
    status === 'complete'
      ? completeRoleResult(snapshots)
      : status === 'incomplete'
        ? incompleteRoleResult(snapshots)
        : status === 'empty'
          ? { status: 'empty', items: [], diagnostics: [] }
          : { status: 'unavailable', items: [], reason: 'Role search failed', diagnostics: [] };

  return createAdminAuthorityProvider(buildAdminRoleHistoryContext(result));
}

function postPayload(entityId: string, ownerAddress: string) {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-post',
    entityId,
    title: 'Post',
    content: 'Content',
    summary: 'Content',
    tags: [],
    ownerName: 'user',
    ownerAddress,
    createdAt: T0,
  };
}

function resolverFor(address: string): IdentityResolver {
  return new IdentityResolver(async () => address);
}

const validChain = [
  roleData('snap-genesis', undefined, [ADMIN]),
  roleData('snap-2', 'snap-genesis', [ADMIN]),
];

// ---- R-HIGH-1: current-role resolution fails closed on incomplete discovery ----

describe('R-HIGH-1 current-role resolution fails closed on incomplete discovery', () => {
  it('resolves the current head for a complete, valid chain', () => {
    const snapshot = getLatestRoleSnapshot(completeRoleResult(validChain));
    expect(snapshot).not.toBeNull();
    expect(snapshot?.snapshotId).toBe('snap-2');
  });

  it('returns null for an empty registry', () => {
    expect(getLatestRoleSnapshot({ status: 'empty', items: [], diagnostics: [] })).toBeNull();
  });

  it('returns null for an unavailable registry', () => {
    expect(
      getLatestRoleSnapshot({
        status: 'unavailable',
        items: [],
        reason: 'Role search failed',
        diagnostics: [],
      }),
    ).toBeNull();
  });

  it('does not select a partial head from an incomplete discovery', () => {
    const partial = [roleData('snap-genesis', undefined, [ADMIN])];
    const snapshot = getLatestRoleSnapshot(incompleteRoleResult(partial));
    expect(snapshot).toBeNull();
  });

  it('does not select a head from a complete but ambiguous lineage', () => {
    const forked = [
      roleData('snap-genesis-a', undefined, [ADMIN]),
      roleData('snap-genesis-b', undefined, [ADMIN]),
    ];
    const snapshot = getLatestRoleSnapshot(completeRoleResult(forked));
    expect(snapshot).toBeNull();
  });

  it('does not preserve Admin authority from an incomplete prefix', () => {
    // The discovered subset grants Admin at its head, but the discovery is
    // incomplete, so the partial head must not authorize any ordinary wallet.
    const partial = [roleData('snap-genesis', undefined, [ADMIN])];
    const snapshot = getLatestRoleSnapshot(incompleteRoleResult(partial));
    expect(resolveUserRole(ADMIN, snapshot)).toBe('User');
  });
});

// ---- Production current-role consumers under incomplete role history ----

describe('production current-role consumers reject incomplete role history', () => {
  let bridge: MockQdnBridge;

  beforeEach(() => {
    store.dispatch(supportApi.util.resetApiState());
    bridge = installMockQdnBridge({ searchResults: () => [] });
  });

  afterEach(() => {
    bridge.cleanup();
  });

  async function installIncompleteRoleHistory(): Promise<{
    genesis: QucpRoleRegistrySnapshot;
  }> {
    const genesis = roleData('snap-genesis', undefined, [ADMIN]);
    const genesisId = await buildRoleSnapshotIdentifier('snap-genesis');
    const revokeId = await buildRoleSnapshotIdentifier('snap-revoke');

    bridge.cleanup();
    bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-rs-') {
          return [
            {
              name: 'iffi_vaba_mees',
              service: 'DOCUMENT',
              identifier: genesisId,
              created: T0,
              updated: T0,
            },
            {
              name: 'iffi_vaba_mees',
              service: 'DOCUMENT',
              identifier: revokeId,
              created: T0 + 1000,
              updated: T0 + 1000,
            },
          ];
        }
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === genesisId) return genesis;
        // The revocation snapshot fails to fetch, so discovery is incomplete.
        if (payload.identifier === revokeId) return null;
        return null;
      },
    });

    return { genesis };
  }

  it('fetchAuthoritativeUserRole does not resolve Admin from incomplete history', async () => {
    await installIncompleteRoleHistory();
    const role = await fetchAuthoritativeUserRole(ADMIN);
    expect(role).toBe('User');
  });

  it('Support category manager precheck rejects incomplete role history', async () => {
    await installIncompleteRoleHistory();
    const result = await store.dispatch(
      supportApi.endpoints.createCategory.initiate({
        name: 'General',
        description: 'General support',
        ownerName: 'iffi_vaba_mees',
        ownerAddress: ADMIN,
      }),
    );

    expect(result).toHaveProperty('error');
    expect(bridge.published).toHaveLength(0);
  });
});

// ---- R-HIGH-2: zero raw Admin-domain resources still classify authority ----

describe('R-HIGH-2 zero raw Admin-domain resources classify authority dependency', () => {
  it('complete authority + zero raw resources -> empty', async () => {
    const result = await queryPosts(
      async () => [],
      async () => postPayload('x', USER),
      resolverFor(USER),
      { adminAuthority: providerFor('complete', validChain), sharedAdminOwnership: true },
    );
    expect(result.status).toBe('empty');
  });

  it('incomplete authority + zero raw resources -> incomplete', async () => {
    const result = await queryPosts(
      async () => [],
      async () => postPayload('x', USER),
      resolverFor(USER),
      {
        adminAuthority: providerFor('incomplete', [roleData('snap-genesis', undefined, [ADMIN])]),
        sharedAdminOwnership: true,
      },
    );
    expect(result.status).toBe('incomplete');
  });

  it('unavailable authority + zero raw resources -> unavailable', async () => {
    const result = await queryPosts(
      async () => [],
      async () => postPayload('x', USER),
      resolverFor(USER),
      { adminAuthority: providerFor('unavailable', []), sharedAdminOwnership: true },
    );
    expect(result.status).toBe('unavailable');
  });

  it('invalid authority + zero raw resources -> incomplete (fail closed)', async () => {
    const forked = [
      roleData('snap-genesis-a', undefined, [ADMIN]),
      roleData('snap-genesis-b', undefined, [ADMIN]),
    ];
    const result = await queryPosts(
      async () => [],
      async () => postPayload('x', USER),
      resolverFor(USER),
      { adminAuthority: providerFor('complete', forked), sharedAdminOwnership: true },
    );
    expect(result.status).toBe('incomplete');
  });
});

// ---- Global search composition ----

describe('global search does not report complete no-results from a degraded zero-resource domain', () => {
  it('zero Admin resources + unavailable role dependency -> degraded, complete=false', async () => {
    const bridge = installMockQdnBridge({
      selectedAccount: USER,
      ownerName: 'some-user',
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-rs-') {
          throw new Error('role search infrastructure down');
        }
        return [];
      },
      fetch: () => null,
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

  it('zero Admin resources + complete authority -> legitimate empty', async () => {
    const bridge = installMockQdnBridge({
      selectedAccount: USER,
      ownerName: 'some-user',
      searchResults: () => [],
      fetch: () => null,
    });

    try {
      const response = await searchGlobalContent('ghost', {
        isAuthenticated: true,
        currentAddress: USER,
        role: 'User',
      });
      expect(response.results).toEqual([]);
      expect(response.complete).toBe(true);
      expect(response.degraded).toBe(false);
      expect(response.degradedDomains).toEqual([]);
    } finally {
      bridge.cleanup();
    }
  });
});
