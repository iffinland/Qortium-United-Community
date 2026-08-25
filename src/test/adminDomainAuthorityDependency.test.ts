// ===== R-HIGH-2: Role-Authority Dependency into Domain Result State =====
//
// The production authority provider and the shared validated query classifier
// are exercised together. The authority dependency is derived through the real
// `buildAdminRoleHistoryContext` lineage validation, not injected as a boolean.

import { describe, it, expect } from 'vitest';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import { queryPosts } from '../services/qdn/runtime/postRuntime';
import {
  buildAdminRoleHistoryContext,
  createAdminAuthorityProvider,
} from '../services/qdn/roles/adminHistoricalAuthorization';
import type { RoleSnapshotQueryResult } from '../services/qdn/runtime/roleSnapshotRuntime';
import type { QucpRoleRegistrySnapshot } from '../services/qdn/schemas/roleRegistrySnapshotSchema';
import type { QdnResourceEnvelope } from '../services/qdn/QdnResourceEnvelope';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';

const SYSOP = QUC_SYSOP_ADDRESS;
const ADMIN = wallet('QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const USER = wallet('QUuuuuuuuuuuuuuuuuuuuuuuuuuuuuu');
const T0 = 1700000000000;

function wallet(seed: string): string {
  const body = (seed + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
    .slice(0, 33);
  return `Q${body}`;
}

function roleSnapshot(
  snapshotId: string,
  previousSnapshotId: string | undefined,
  admins: string[],
): QucpRoleRegistrySnapshot {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-role-snapshot',
    snapshotId,
    previousSnapshotId,
    sysopAddress: SYSOP,
    members: admins.map((address) => ({ address, roles: ['admin'] as const })),
    createdAt: T0,
  };
}

function roleEnvelope(
  data: QucpRoleRegistrySnapshot,
): QdnResourceEnvelope<QucpRoleRegistrySnapshot> {
  return {
    metadata: {
      name: 'iffi_vaba_mees',
      service: 'DOCUMENT',
      identifier: `qucp-rs-${data.snapshotId}`,
      created: T0,
      updated: T0,
    },
    data,
    source: 'qdn',
    resolvedPublisherAddress: SYSOP,
  };
}

function roleResult(
  status: RoleSnapshotQueryResult['status'],
  snapshots: QucpRoleRegistrySnapshot[],
): RoleSnapshotQueryResult {
  if (status === 'unavailable') {
    return { status, items: [], reason: 'Role search failed', diagnostics: [] };
  }
  if (status === 'empty') {
    return { status, items: [], diagnostics: [] };
  }
  if (status === 'incomplete') {
    return {
      status,
      items: snapshots.map((s) => ({
        envelope: roleEnvelope(s),
        entityId: s.snapshotId,
        publisherName: 'iffi_vaba_mees',
        publisherAddress: SYSOP,
      })),
      rejectedCount: 0,
      quarantinedCount: 0,
      reason: 'Incomplete role snapshot discovery',
      diagnostics: [],
    };
  }
  return {
    status: 'complete',
    items: snapshots.map((s) => ({
      envelope: roleEnvelope(s),
      entityId: s.snapshotId,
      publisherName: 'iffi_vaba_mees',
      publisherAddress: SYSOP,
    })),
    rejectedCount: 0,
    quarantinedCount: 0,
    diagnostics: [],
  };
}

function providerFor(
  status: RoleSnapshotQueryResult['status'],
  snapshots: QucpRoleRegistrySnapshot[],
) {
  return createAdminAuthorityProvider(
    buildAdminRoleHistoryContext(roleResult(status, snapshots)),
  );
}

function meta(name: string, identifier: string, created = T0) {
  return { name, service: 'DOCUMENT', identifier, created, updated: created };
}

function postPayload(entityId: string, ownerName: string, ownerAddress: string) {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-post',
    entityId,
    title: 'Post',
    content: 'Content',
    summary: 'Content',
    tags: [],
    ownerName,
    ownerAddress,
    createdAt: T0,
  };
}

function resolver(nameToAddress: Record<string, string>) {
  return new IdentityResolver(async (name) => nameToAddress[name] ?? null);
}

const validChain = [
  roleSnapshot('genesis', undefined, [ADMIN]),
  roleSnapshot('snap-2', 'genesis', [ADMIN]),
];

describe('R-HIGH-2: Admin-domain result state propagates role authority dependency', () => {
  it('complete valid role dependency + zero accepted resources -> empty', async () => {
    const result = await queryPosts(
      async () => [meta('user', 'qucp-post-post0001')],
      async () => postPayload('post0001', 'user', USER),
      resolver({ user: USER }),
      { adminAuthority: providerFor('complete', validChain), sharedAdminOwnership: true },
    );
    expect(result.items).toHaveLength(0);
    expect(result.status).toBe('empty');
  });

  it('role dependency incomplete + resources rejected -> incomplete', async () => {
    const result = await queryPosts(
      async () => [meta('user', 'qucp-post-post0001')],
      async () => postPayload('post0001', 'user', USER),
      resolver({ user: USER }),
      { adminAuthority: providerFor('incomplete', [roleSnapshot('genesis', undefined, [ADMIN])]), sharedAdminOwnership: true },
    );
    expect(result.items).toHaveLength(0);
    expect(result.status).toBe('incomplete');
  });

  it('role dependency unavailable + resources rejected -> unavailable', async () => {
    const result = await queryPosts(
      async () => [meta('user', 'qucp-post-post0001')],
      async () => postPayload('post0001', 'user', USER),
      resolver({ user: USER }),
      { adminAuthority: providerFor('unavailable', []), sharedAdminOwnership: true },
    );
    expect(result.items).toHaveLength(0);
    expect(result.status).toBe('unavailable');
  });

  it('partial valid results + degraded role dependency -> incomplete', async () => {
    const result = await queryPosts(
      async () => [meta('sysop', 'qucp-post-posts0001')],
      async () => postPayload('posts0001', 'sysop', SYSOP),
      resolver({ sysop: SYSOP }),
      { adminAuthority: providerFor('unavailable', []), sharedAdminOwnership: true },
    );
    expect(result.items).toHaveLength(1);
    expect(result.status).toBe('incomplete');
  });

  it('recovery after role dependency returns -> complete', async () => {
    const result = await queryPosts(
      async () => [meta('admin-a', 'qucp-post-posta0001')],
      async () => postPayload('posta0001', 'admin-a', ADMIN),
      resolver({ 'admin-a': ADMIN }),
      { adminAuthority: providerFor('complete', validChain), sharedAdminOwnership: true },
    );
    expect(result.items).toHaveLength(1);
    expect(result.status).toBe('complete');
  });
});
