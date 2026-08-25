// ===== H4 Role Mutation Safety Tests =====
//
// Prove that a role mutation can only publish the next snapshot when role
// discovery is complete, the lineage is valid and unambiguous, and a single
// authoritative current snapshot exists. Discovery failure must never create
// a competing genesis or silently rebuild the registry.

import { describe, it, expect } from 'vitest';
import {
  requireCurrentRoleSnapshotForMutation,
  type RoleSnapshotQueryResult,
} from '../services/qdn/runtime/roleSnapshotRuntime';
import type { QucpRoleRegistrySnapshot } from '../services/qdn/schemas/roleRegistrySnapshotSchema';
import type { QdnResourceEnvelope } from '../services/qdn/QdnResourceEnvelope';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';

const SYSOP = QUC_SYSOP_ADDRESS;

function rsItem(
  snapshotId: string,
  previousSnapshotId?: string,
  created = 1700000000000,
): {
  envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>;
  entityId: string;
  publisherName: string;
  publisherAddress: string;
} {
  return {
    envelope: {
      metadata: {
        name: 'iffi_vaba_mees',
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
        members: [],
        createdAt: created,
      },
      source: 'qdn',
    },
    entityId: snapshotId,
    publisherName: 'iffi_vaba_mees',
    publisherAddress: SYSOP,
  };
}

function complete(items: ReturnType<typeof rsItem>[]): RoleSnapshotQueryResult {
  return {
    status: 'complete',
    items,
    rejectedCount: 0,
    quarantinedCount: 0,
    diagnostics: [],
  };
}

describe('H4 requireCurrentRoleSnapshotForMutation', () => {
  it('blocks mutation when discovery is incomplete', () => {
    const result: RoleSnapshotQueryResult = {
      status: 'incomplete',
      items: [rsItem('snap-1')],
      rejectedCount: 0,
      quarantinedCount: 0,
      reason: 'Partial discovery',
      diagnostics: [],
    };
    expect(() => requireCurrentRoleSnapshotForMutation(result)).toThrow(/incomplete/i);
  });

  it('blocks mutation when discovery is unavailable', () => {
    const result: RoleSnapshotQueryResult = {
      status: 'unavailable',
      items: [],
      reason: 'Search failed',
      diagnostics: [],
    };
    expect(() => requireCurrentRoleSnapshotForMutation(result)).toThrow(/unavailable/i);
  });

  it('blocks mutation on empty discovery (no new genesis)', () => {
    const result: RoleSnapshotQueryResult = {
      status: 'empty',
      items: [],
      diagnostics: [],
    };
    expect(() => requireCurrentRoleSnapshotForMutation(result)).toThrow(/No role snapshots/i);
  });

  it('blocks mutation on a forked lineage', () => {
    const result = complete([
      rsItem('genesis'),
      rsItem('child-1', 'genesis', 1700000001000),
      rsItem('child-2', 'genesis', 1700000002000),
    ]);
    expect(() => requireCurrentRoleSnapshotForMutation(result)).toThrow(/ambiguous/i);
  });

  it('blocks mutation when the current snapshot is ambiguous (cycle)', () => {
    const result = complete([
      rsItem('snap-a', 'snap-b', 1700000001000),
      rsItem('snap-b', 'snap-a', 1700000002000),
    ]);
    expect(() => requireCurrentRoleSnapshotForMutation(result)).toThrow(/ambiguous/i);
  });

  it('allows mutation with a complete, valid, unambiguous lineage', () => {
    const result = complete([
      rsItem('genesis'),
      rsItem('snap-2', 'genesis', 1700000001000),
    ]);
    const snapshot = requireCurrentRoleSnapshotForMutation(result);
    expect(snapshot.snapshotId).toBe('snap-2');
    expect(snapshot.previousSnapshotId).toBe('genesis');
  });

  it('failed discovery cannot create a competing genesis', () => {
    const result: RoleSnapshotQueryResult = {
      status: 'unavailable',
      items: [],
      reason: 'Search failed',
      diagnostics: [],
    };
    expect(() => requireCurrentRoleSnapshotForMutation(result)).toThrow();
  });
});
