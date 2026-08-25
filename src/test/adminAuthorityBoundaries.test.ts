// ===== H1 / M5 Boundary Tests =====
//
// These tests exercise the production read-side runtimes and the canonical
// historical Admin/SysOp authorization provider. They prove that valid-looking
// self-owned QDN content from ordinary Users cannot become admin-managed
// content, that revoked Admins cannot keep updating old resources, and that
// Admin-managed entities use shared Admin-state rather than creator ownership.

import { describe, it, expect } from 'vitest';
import { queryPosts } from '../services/qdn/runtime/postRuntime';
import { queryPolls } from '../services/qdn/runtime/pollRuntime';
import { queryProjects } from '../services/qdn/runtime/projectRuntime';
import { queryWikiArticles } from '../services/qdn/runtime/wikiRuntime';
import { queryEvents } from '../services/qdn/runtime/eventRuntime';
import {
  querySupportCategories,
  applyCategoryHistoricalAuthorization,
} from '../services/qdn/runtime/supportRuntime';
import {
  createAdminAuthorityProvider,
  verifyAdminHistoricalAuthorization,
  type AdminRoleHistoryContext,
} from '../services/qdn/roles/adminHistoricalAuthorization';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import type { QdnResourceEnvelope } from '../services/qdn/QdnResourceEnvelope';
import type { QucpRoleRegistrySnapshot } from '../services/qdn/schemas/roleRegistrySnapshotSchema';

// ---- Constants ----

const SYSOP = QUC_SYSOP_ADDRESS;
const ADMIN_A = wallet('QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const ADMIN_B = wallet('QBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
const USER = wallet('QUuuuuuuuuuuuuuuuuuuuuuuuuuuuuu');

function wallet(seed: string): string {
  const body = (seed + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
    .slice(0, 33);
  return `Q${body}`;
}

const T0 = 1700000000000;

// ---- Role Snapshot Helpers ----

interface RoleSnapshotFixture {
  envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>;
  snapshotEntityId: string;
}

function roleSnapshot(
  snapshotId: string,
  admins: string[],
  created: number,
  previousSnapshotId?: string,
): RoleSnapshotFixture {
  return {
    envelope: {
      metadata: {
        name: 'SysOp',
        service: 'DOCUMENT',
        identifier: `qucp-rs-${snapshotId}`,
        created,
        updated: created,
      },
      data: {
        schemaVersion: 1,
        resourceFamily: 'qucp-role-snapshot',
        snapshotId,
        previousSnapshotId,
        sysopAddress: SYSOP,
        members: admins.map((address) => ({ address, roles: ['admin'] })),
        createdAt: created,
      },
      source: 'qdn',
    },
    snapshotEntityId: snapshotId,
  };
}

function makeContext(
  snapshots: RoleSnapshotFixture[],
  opts: { complete?: boolean; lineageValid?: boolean; lineageStatus?: string } = {},
): AdminRoleHistoryContext {
  const snapshotMap = new Map<string, { snapshot: QucpRoleRegistrySnapshot; identifier: string }>();
  for (const s of snapshots) {
    snapshotMap.set(s.envelope.data.snapshotId, {
      snapshot: s.envelope.data,
      identifier: s.envelope.metadata.identifier,
    });
  }
  return {
    roleSnapshots: snapshots,
    snapshotMap,
    roleHistoryComplete: opts.complete ?? true,
    roleHistoryUnavailable: false,
    roleLineageValid: opts.lineageValid ?? true,
    roleLineageStatus: opts.lineageStatus,
  };
}

function provider(snapshots: RoleSnapshotFixture[], opts?: Parameters<typeof makeContext>[1]) {
  return createAdminAuthorityProvider(makeContext(snapshots, opts));
}

// ---- Domain Payload / Metadata Helpers ----

function meta(name: string, identifier: string, created: number, updated = created) {
  return { name, service: 'DOCUMENT', identifier, created, updated };
}

function postPayload(entityId: string, ownerName: string, ownerAddress: string, title = 'Post') {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-post',
    entityId,
    title,
    content: 'Content',
    summary: 'Content',
    tags: [],
    ownerName,
    ownerAddress,
    createdAt: T0,
  };
}

function pollPayload(entityId: string, ownerName: string, ownerAddress: string) {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-poll',
    entityId,
    question: 'Question?',
    description: 'Description',
    options: [
      { optionId: 'opt-a', label: 'A' },
      { optionId: 'opt-b', label: 'B' },
    ],
    isClosed: false,
    allowVoteChange: true,
    ownerName,
    ownerAddress,
    createdAt: T0,
  };
}

function projectPayload(entityId: string, ownerName: string, ownerAddress: string, title = 'Project') {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-project',
    entityId,
    title,
    description: 'Description',
    status: 'planned',
    ownerName,
    ownerAddress,
    createdAt: T0,
  };
}

function wikiPayload(entityId: string, ownerName: string, ownerAddress: string, title = 'Wiki') {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-wiki',
    entityId,
    title,
    slug: 'wiki',
    content: 'Content',
    summary: 'Content',
    categoryId: 'guides',
    tags: [],
    ownerName,
    ownerAddress,
    createdAt: T0,
    revision: 1,
    status: 'active',
  };
}

function eventPayload(entityId: string, ownerName: string, ownerAddress: string, title = 'Event') {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-event',
    entityId,
    title,
    category: 'Community',
    description: 'Description',
    startDate: T0,
    ownerName,
    ownerAddress,
    createdAt: T0,
    revision: 1,
    status: 'active',
  };
}

function categoryPayload(entityId: string, ownerName: string, ownerAddress: string) {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-support-category',
    entityId,
    name: 'Category',
    isActive: true,
    ownerName,
    ownerAddress,
    createdAt: T0,
  };
}

function resolver(address: string) {
  return new IdentityResolver(async () => address);
}

// ---- Tests ----

describe('H1 read-side Admin/SysOp authorization (production runtimes)', () => {
  const adminSnapshot = roleSnapshot('snap-1', [ADMIN_A], T0 - 1000);

  it('rejects a direct-QDN ordinary User post', async () => {
    const result = await queryPosts(
      async () => [meta('user', 'qucp-post-post0001', T0)],
      async () => postPayload('post0001', 'user', USER),
      resolver(USER),
      { adminAuthority: provider([adminSnapshot]), sharedAdminOwnership: true },
    );

    expect(result.items).toHaveLength(0);
    expect(result.status).toBe('empty');
    expect(result.diagnostics.some((d) => d.code === 'not-admin-nor-sysop-at-publication')).toBe(true);
  });

  it('rejects a direct-QDN ordinary User poll', async () => {
    const result = await queryPolls(
      async () => [meta('user', 'qucp-poll-poll0001', T0)],
      async () => pollPayload('poll0001', 'user', USER),
      resolver(USER),
      { adminAuthority: provider([adminSnapshot]), sharedAdminOwnership: true },
    );

    expect(result.items).toHaveLength(0);
    expect(result.status).toBe('empty');
  });

  it('rejects a direct-QDN ordinary User project', async () => {
    const result = await queryProjects(
      async () => [meta('user', 'qucp-project-proj0001', T0)],
      async () => projectPayload('proj0001', 'user', USER),
      resolver(USER),
      { adminAuthority: provider([adminSnapshot]), sharedAdminOwnership: true },
    );

    expect(result.items).toHaveLength(0);
    expect(result.status).toBe('empty');
  });

  it('rejects a direct-QDN ordinary User wiki article', async () => {
    const result = await queryWikiArticles(
      async () => [meta('user', 'qucp-wiki-wiki0001', T0)],
      async () => wikiPayload('wiki0001', 'user', USER),
      resolver(USER),
      { adminAuthority: provider([adminSnapshot]), sharedAdminOwnership: true },
    );

    expect(result.items).toHaveLength(0);
    expect(result.status).toBe('empty');
  });

  it('rejects a direct-QDN ordinary User event', async () => {
    const result = await queryEvents(
      async () => [meta('user', 'qucp-event-evnt0001', T0)],
      async () => eventPayload('evnt0001', 'user', USER),
      resolver(USER),
      { adminAuthority: provider([adminSnapshot]), sharedAdminOwnership: true },
    );

    expect(result.items).toHaveLength(0);
    expect(result.status).toBe('empty');
  });

  it('rejects an unauthorized support category through the production filter', async () => {
    const result = await querySupportCategories(
      async () => [meta('user', 'qucp-support-category-sc-user0001', T0)],
      async () => categoryPayload('sc-user0001', 'user', USER),
      resolver(USER),
    );

    const filtered = applyCategoryHistoricalAuthorization(
      result,
      [adminSnapshot],
      true,
      true,
    );

    expect(filtered.items).toHaveLength(0);
    expect(filtered.status).toBe('empty');
  });

  it('accepts a currently authorized Admin resource', async () => {
    const result = await queryPosts(
      async () => [meta('admin-a', 'qucp-post-posta0001', T0)],
      async () => postPayload('posta0001', 'admin-a', ADMIN_A),
      resolver(ADMIN_A),
      { adminAuthority: provider([adminSnapshot]), sharedAdminOwnership: true },
    );

    expect(result.status).toBe('complete');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].publisherAddress).toBe(ADMIN_A);
  });

  it('accepts a SysOp resource without a role snapshot', async () => {
    const result = await queryPosts(
      async () => [meta('iffi_vaba_mees', 'qucp-post-posts0001', T0)],
      async () => postPayload('posts0001', 'iffi_vaba_mees', SYSOP),
      resolver(SYSOP),
      { adminAuthority: provider([]), sharedAdminOwnership: true },
    );

    expect(result.status).toBe('complete');
    expect(result.items).toHaveLength(1);
  });

  it('rejects a revoked Admin later update using effective update time', async () => {
    const granted = roleSnapshot('snap-grant', [ADMIN_A], T0 - 2000);
    const revoked = roleSnapshot('snap-revoke', [], T0 + 1000, 'snap-grant');
    const created = T0 - 500;
    const updated = T0 + 2000;

    const result = await queryPosts(
      async () => [meta('admin-a', 'qucp-post-postrev1', created, updated)],
      async () => postPayload('postrev1', 'admin-a', ADMIN_A, 'Hijacked'),
      resolver(ADMIN_A),
      { adminAuthority: provider([granted, revoked]), sharedAdminOwnership: true },
    );

    expect(result.items).toHaveLength(0);
    expect(result.status).toBe('empty');
  });

  it('creation-time authority cannot authorize a later revoked update', () => {
    const granted = roleSnapshot('snap-grant', [ADMIN_A], T0 - 2000);
    const revoked = roleSnapshot('snap-revoke', [], T0 + 1000, 'snap-grant');
    const created = T0 - 500;
    const updated = T0 + 2000;

    // Trusting only `created` would authorize; the effective mutation time
    // (`updated ?? created`) must be used instead.
    const atCreation = verifyAdminHistoricalAuthorization({
      publisherWallet: ADMIN_A,
      mutationQdnTime: created,
      roleSnapshots: [granted, revoked],
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(atCreation.authorized).toBe(true);

    const atUpdate = verifyAdminHistoricalAuthorization({
      publisherWallet: ADMIN_A,
      mutationQdnTime: updated,
      roleSnapshots: [granted, revoked],
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(atUpdate.authorized).toBe(false);
  });

  it('Admin B manages an entity originally created by Admin A (shared Admin-state)', async () => {
    const both = roleSnapshot('snap-both', [ADMIN_A, ADMIN_B], T0 - 1000);
    const created = T0;
    const updated = T0 + 5000;

    const result = await queryPosts(
      async () => [
        meta('admin-a', 'qucp-post-postshared1', created),
        meta('admin-b', 'qucp-post-postshared1', created, updated),
      ],
      async ({ name }: { name: string }) => {
        if (name === 'admin-a') return postPayload('postshared1', 'admin-a', ADMIN_A, 'Original');
        return postPayload('postshared1', 'admin-b', ADMIN_B, 'Edited by B');
      },
      new IdentityResolver(async (name) => {
        if (name === 'admin-a') return ADMIN_A;
        if (name === 'admin-b') return ADMIN_B;
        return null;
      }),
      { adminAuthority: provider([both]), sharedAdminOwnership: true },
    );

    expect(result.status).toBe('complete');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].publisherAddress).toBe(ADMIN_B);
    expect((result.items[0].envelope.data as { title: string }).title).toBe('Edited by B');
  });
});

describe('H1 fail-closed role lineage on the read side', () => {
  it('rejects when role history is incomplete', async () => {
    const result = await queryPosts(
      async () => [meta('admin-a', 'qucp-post-postinc1', T0)],
      async () => postPayload('postinc1', 'admin-a', ADMIN_A),
      resolver(ADMIN_A),
      {
        adminAuthority: provider([roleSnapshot('snap-1', [ADMIN_A], T0 - 1000)], { complete: false }),
        sharedAdminOwnership: true,
      },
    );

    expect(result.items).toHaveLength(0);
  });

  it('rejects when role lineage is forked', async () => {
    const result = await queryPosts(
      async () => [meta('admin-a', 'qucp-post-postfork1', T0)],
      async () => postPayload('postfork1', 'admin-a', ADMIN_A),
      resolver(ADMIN_A),
      {
        adminAuthority: provider(
          [roleSnapshot('snap-1', [ADMIN_A], T0 - 1000)],
          { lineageValid: false, lineageStatus: 'Forked role snapshot history: snap-1' },
        ),
        sharedAdminOwnership: true,
      },
    );

    expect(result.items).toHaveLength(0);
  });
});
