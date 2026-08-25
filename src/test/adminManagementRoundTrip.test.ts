// ===== SysOp Admin Management Round-Trip =====

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store } from '../store';
import { roleApi } from '../store/api/roleApi';
import {
  queryRoleSnapshots,
  getLatestRoleSnapshot,
} from '../services/qdn/runtime/roleSnapshotRuntime';
import { roleSnapshotPolicy } from '../services/qdn/policies/roleSnapshotPolicy';
import {
  roleRegistrySnapshotSchema,
  type QucpRoleRegistrySnapshot,
} from '../services/qdn/schemas/roleRegistrySnapshotSchema';
import { buildRoleSnapshotIdentifier } from '../services/qdn/identifiers/roleSnapshotIdentifiers';
import { resolveUserRole } from '../services/auth/authorization';
import {
  assignAdminRole,
  removeAdminRole,
  createAdminAssignmentSnapshot,
  createAdminRemovalSnapshot,
} from '../services/qdn/roles/roleSnapshotMutation';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

const ADMIN = 'QN1XYwwmTzXemusDb9p7T1nKJEACLHGgaL';

function makeSnapshot(
  snapshotId: string,
  members: QucpRoleRegistrySnapshot['members'],
  previousSnapshotId?: string,
): QucpRoleRegistrySnapshot {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-role-snapshot',
    snapshotId,
    previousSnapshotId,
    sysopAddress: QUC_SYSOP_ADDRESS,
    members,
    createdAt: 1787403000000,
  };
}

describe('SysOp Admin management round-trip', () => {
  let bridge: MockQdnBridge;

  beforeEach(() => {
    store.dispatch(roleApi.util.resetApiState());
    bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-rs-') return [];
        return [];
      },
    });
  });

  afterEach(() => {
    bridge.cleanup();
  });

  it('SysOp assignment publishes a canonical role snapshot', async () => {
    const currentId = 'snap-current';
    const currentIdentifier = await buildRoleSnapshotIdentifier(currentId);
    const currentPayload = makeSnapshot(currentId, []);

    bridge.cleanup();
    bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-rs-') {
          return [{ name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier: currentIdentifier, created: 1787403000000, updated: 1787403000000 }];
        }
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === currentIdentifier) return currentPayload;
        return null;
      },
    });

    const result = await store.dispatch(
      roleApi.endpoints.assignAdmin.initiate({
        actorAddress: QUC_SYSOP_ADDRESS,
        targetAddress: ADMIN,
        targetDisplayName: 'Admin One',
      }),
    );

    expect(result).toHaveProperty('data');
    expect(bridge.published).toHaveLength(1);
    const published = bridge.published[0];
    expect(published.service).toBe('DOCUMENT');
    expect(published.identifier).toMatch(/^qucp-rs-[a-f0-9]{26}$/);
    expect(published.payload.resourceFamily).toBe('qucp-role-snapshot');
    expect(published.payload.previousSnapshotId).toBe(currentId);

    const members = published.payload.members as Array<{ address: string; roles: string[] }>;
    expect(members.some((m) => m.address === ADMIN && m.roles.includes('admin'))).toBe(true);

    const schemaResult = roleRegistrySnapshotSchema.safeParse(published.payload);
    expect(schemaResult.success).toBe(true);
    const policyParse = roleSnapshotPolicy.parse(published.payload);
    expect(policyParse.success).toBe(true);
  });

  it('Admin or User mutation attempt is rejected below the UI', async () => {
    const result = await store.dispatch(
      roleApi.endpoints.assignAdmin.initiate({
        actorAddress: ADMIN,
        targetAddress: 'QAnotherAnotherAnotherAnotherAnotherA',
      }),
    );

    expect(result).toHaveProperty('error');
    expect(bridge.published).toHaveLength(0);
  });

  it('spoofed SysOp actor is still rejected when the selected account is not SysOp', async () => {
    bridge.cleanup();
    bridge = installMockQdnBridge({
      selectedAccount: ADMIN,
      ownerName: 'AdminUser',
      searchResults: () => [],
    });

    const result = await store.dispatch(
      roleApi.endpoints.assignAdmin.initiate({
        actorAddress: QUC_SYSOP_ADDRESS,
        targetAddress: 'QAnotherAnotherAnotherAnotherAnotherA',
      }),
    );

    expect(result).toHaveProperty('error');
    expect(bridge.published).toHaveLength(0);
  });

  it('removed Admin resolves to User through the canonical reader', async () => {
    const snapshotId = 'snap-remove-admin';
    const members = assignAdminRole([], ADMIN, 'Admin One');
    const removalSnapshot = createAdminRemovalSnapshot(
      makeSnapshot(snapshotId, members),
      'snap-removed',
      ADMIN,
      1787403100000,
    );

    expect(resolveUserRole(ADMIN, removalSnapshot)).toBe('User');
    expect(resolveUserRole(QUC_SYSOP_ADDRESS, removalSnapshot)).toBe('SysOp');
  });

  it('valid assignment round-trips through the canonical role reader', async () => {
    const snapshotId = 'snap-valid-admin';
    const payload = makeSnapshot(
      snapshotId,
      [{ address: ADMIN, roles: ['admin'], displayName: 'Admin One' }],
    );
    const identifier = await buildRoleSnapshotIdentifier(snapshotId);

    const result = await queryRoleSnapshots(
      async () => [{ name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier, created: 1787403000000, updated: 1787403000000 }],
      async () => payload,
      new IdentityResolver(async () => QUC_SYSOP_ADDRESS),
    );

    const snapshot = getLatestRoleSnapshot(result);
    expect(snapshot).not.toBeNull();
    expect(resolveUserRole(ADMIN, snapshot)).toBe('Admin');
    expect(resolveUserRole('QUnassignedUnassignedUnassignedUnassi', snapshot)).toBe('User');
  });

  it('SysOp removal publishes the next snapshot without the removed Admin', async () => {
    const currentId = 'snap-current';
    const identifier = await buildRoleSnapshotIdentifier(currentId);
    const currentPayload = makeSnapshot(currentId, [
      { address: ADMIN, roles: ['admin'], displayName: 'Admin One' },
    ]);

    bridge.cleanup();
    bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-rs-') {
          return [{ name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier, created: 1787403000000, updated: 1787403000000 }];
        }
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === identifier) return currentPayload;
        return null;
      },
    });

    const result = await store.dispatch(
      roleApi.endpoints.removeAdmin.initiate({
        actorAddress: QUC_SYSOP_ADDRESS,
        targetAddress: ADMIN,
      }),
    );

    expect(result).toHaveProperty('data');
    expect(bridge.published).toHaveLength(1);
    const published = bridge.published[0];
    expect(published.identifier).toMatch(/^qucp-rs-[a-f0-9]{26}$/);
    expect(published.payload.previousSnapshotId).toBe(currentId);
    const members = published.payload.members as Array<{ address: string }>;
    expect(members.some((m) => m.address === ADMIN)).toBe(false);
  });

  it('legacy quc-roles never participates and obsolete roles are not assignable', () => {
    const members = removeAdminRole(
      assignAdminRole([], ADMIN, 'Admin One'),
      ADMIN,
    );
    expect(members.some((m) => m.roles.includes('moderator'))).toBe(false);
    expect(members.some((m) => m.roles.includes('support'))).toBe(false);

    const assignment = createAdminAssignmentSnapshot(null, 'snap-new', ADMIN, 'Admin One');
    expect(assignment.sysopAddress).toBe(QUC_SYSOP_ADDRESS);
    expect(assignment.resourceFamily).toBe('qucp-role-snapshot');
  });
});
