// ===== R-HIGH-1: One Canonical Role-Lineage Validator =====
//
// These tests exercise the production lineage validator and the production
// context builders that feed historical authorization, current-role resolution,
// and role mutation. They do not inject a fake `lineageValid` boolean; they
// build real snapshot sets and observe the derived verdict.

import { describe, it, expect } from 'vitest';
import {
  validateRoleLineage,
  type SnapshotEntry,
} from '../services/qdn/roles/registryLineage';
import {
  buildAdminRoleHistoryContext,
  createAdminAuthorityProvider,
} from '../services/qdn/roles/adminHistoricalAuthorization';
import { buildSupportRoleContext } from '../services/qdn/runtime/supportTicketStatusRuntime';
import { selectCurrentSnapshot } from '../services/qdn/roles/registrySnapshotSelection';
import { requireCurrentRoleSnapshotForMutation } from '../services/qdn/runtime/roleSnapshotRuntime';
import type { RoleSnapshotQueryResult } from '../services/qdn/runtime/roleSnapshotRuntime';
import type { QucpRoleRegistrySnapshot } from '../services/qdn/schemas/roleRegistrySnapshotSchema';
import type { QdnResourceEnvelope } from '../services/qdn/QdnResourceEnvelope';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';

const SYSOP = QUC_SYSOP_ADDRESS;
const ADMIN = wallet('QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

function wallet(seed: string): string {
  const body = (seed + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
    .slice(0, 33);
  return `Q${body}`;
}

function snapshotData(
  snapshotId: string,
  previousSnapshotId?: string,
  admins: string[] = [],
): QucpRoleRegistrySnapshot {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-role-snapshot',
    snapshotId,
    previousSnapshotId,
    sysopAddress: SYSOP,
    members: admins.map((address) => ({ address, roles: ['admin'] as const })),
    createdAt: 1700000000000,
  };
}

function envelopeFor(
  data: QucpRoleRegistrySnapshot,
  created = 1700000000000,
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

function snapMap(
  snapshots: QucpRoleRegistrySnapshot[],
): Map<string, SnapshotEntry> {
  const map = new Map<string, SnapshotEntry>();
  for (const s of snapshots) {
    map.set(s.snapshotId, {
      snapshot: s,
      identifier: `qucp-rs-${s.snapshotId}`,
    });
  }
  return map;
}

function completeRoleResult(
  snapshots: QucpRoleRegistrySnapshot[],
): RoleSnapshotQueryResult {
  return {
    status: 'complete',
    items: snapshots.map((s) => ({
      envelope: envelopeFor(s),
      entityId: s.snapshotId,
      publisherName: 'iffi_vaba_mees',
      publisherAddress: SYSOP,
    })),
    rejectedCount: 0,
    quarantinedCount: 0,
    diagnostics: [],
  };
}

describe('canonical role lineage validator', () => {
  it('accepts one genesis plus a valid linear chain and resolves one head', () => {
    const result = validateRoleLineage(
      snapMap([
        snapshotData('genesis'),
        snapshotData('snap-2', 'genesis'),
        snapshotData('snap-3', 'snap-2'),
      ]),
    );
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.head).toBe('snap-3');
  });

  it('accepts a single genesis snapshot', () => {
    const result = validateRoleLineage(snapMap([snapshotData('genesis')]));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.head).toBe('genesis');
  });

  it('rejects multiple genesis roots', () => {
    const result = validateRoleLineage(
      snapMap([snapshotData('genesis-a'), snapshotData('genesis-b')]),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('multiple-genesis');
  });

  it('rejects an orphan successor with a missing predecessor', () => {
    const result = validateRoleLineage(
      snapMap([snapshotData('orphan', 'missing-parent')]),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('missing-previous');
  });

  it('rejects a cycle', () => {
    const result = validateRoleLineage(
      snapMap([
        snapshotData('snap-a', 'snap-b'),
        snapshotData('snap-b', 'snap-a'),
      ]),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('cycle');
  });

  it('rejects a same-parent fork', () => {
    const result = validateRoleLineage(
      snapMap([
        snapshotData('genesis'),
        snapshotData('child-1', 'genesis'),
        snapshotData('child-2', 'genesis'),
      ]),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('fork');
  });

  it('rejects a disconnected cycle that hides behind one genesis', () => {
    const result = validateRoleLineage(
      snapMap([
        snapshotData('genesis'),
        snapshotData('loop-a', 'loop-b'),
        snapshotData('loop-b', 'loop-a'),
      ]),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('cycle');
  });

  it('rejects an empty snapshot set', () => {
    const result = validateRoleLineage(snapMap([]));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('empty');
  });
});

describe('production lineage derivation (context builders)', () => {
  it('valid linear chain produces a valid Admin history context', () => {
    const context = buildAdminRoleHistoryContext(
      completeRoleResult([
        snapshotData('genesis', undefined, [ADMIN]),
        snapshotData('snap-2', 'genesis', [ADMIN]),
      ]),
    );
    expect(context.roleLineageValid).toBe(true);
    expect(context.roleHistoryComplete).toBe(true);
    expect(context.roleHistoryUnavailable).toBe(false);
  });

  it('forked lineage produces an invalid Admin history context', () => {
    const context = buildAdminRoleHistoryContext(
      completeRoleResult([
        snapshotData('genesis', undefined, [ADMIN]),
        snapshotData('child-1', 'genesis', [ADMIN]),
        snapshotData('child-2', 'genesis', [ADMIN]),
      ]),
    );
    expect(context.roleLineageValid).toBe(false);
    expect(context.roleLineageStatus).toMatch(/fork/i);
  });

  it('Support role context uses the same canonical validator', () => {
    const context = buildSupportRoleContext(
      completeRoleResult([
        snapshotData('genesis-a'),
        snapshotData('genesis-b'),
      ]),
    );
    expect(context.roleLineageValid).toBe(false);
    expect(context.roleLineageStatus).toMatch(/multiple genesis/i);
  });

  it('selectCurrentSnapshot rejects a forked lineage instead of choosing a child', () => {
    const selection = selectCurrentSnapshot([
      envelopeFor(snapshotData('genesis')),
      envelopeFor(snapshotData('child-1', 'genesis'), 1700000001000),
      envelopeFor(snapshotData('child-2', 'genesis'), 1700000002000),
    ]);
    expect(selection.status).toBe('history-unresolved');
    if (selection.status === 'history-unresolved') {
      expect(selection.reason).toMatch(/fork/i);
    }
  });
});

describe('historical authorization from production lineage', () => {
  it('valid Admin history authorizes the Admin', () => {
    const provider = createAdminAuthorityProvider(
      buildAdminRoleHistoryContext(
        completeRoleResult([
          snapshotData('genesis', undefined, [ADMIN]),
          snapshotData('snap-2', 'genesis', [ADMIN]),
        ]),
      ),
    );
    const decision = provider({
      publisherWallet: ADMIN,
      mutationQdnTime: 1700000001000,
    });
    expect(decision.authorized).toBe(true);
  });

  it('Admin authority from an ambiguous branch is rejected', () => {
    const provider = createAdminAuthorityProvider(
      buildAdminRoleHistoryContext(
        completeRoleResult([
          snapshotData('genesis', undefined, [ADMIN]),
          snapshotData('child-1', 'genesis', [ADMIN]),
          snapshotData('child-2', 'genesis', [ADMIN]),
        ]),
      ),
    );
    const decision = provider({
      publisherWallet: ADMIN,
      mutationQdnTime: 1700000001000,
    });
    expect(decision.authorized).toBe(false);
    if (!decision.authorized) expect(decision.reason).toBe('role-snapshot-lineage-invalid');
  });

  it('ordinary User is rejected with a valid canonical lineage', () => {
    const provider = createAdminAuthorityProvider(
      buildAdminRoleHistoryContext(
        completeRoleResult([
          snapshotData('genesis', undefined, [ADMIN]),
        ]),
      ),
    );
    const decision = provider({
      publisherWallet: wallet('QUuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
      mutationQdnTime: 1700000001000,
    });
    expect(decision.authorized).toBe(false);
  });
});

describe('role mutation cannot extend an ambiguous lineage', () => {
  it('blocks multiple roots', () => {
    expect(() =>
      requireCurrentRoleSnapshotForMutation(
        completeRoleResult([
          snapshotData('genesis-a'),
          snapshotData('genesis-b'),
        ]),
      ),
    ).toThrow(/ambiguous|lineage/i);
  });

  it('blocks a missing parent', () => {
    expect(() =>
      requireCurrentRoleSnapshotForMutation(
        completeRoleResult([snapshotData('orphan', 'missing-parent')]),
      ),
    ).toThrow(/ambiguous|lineage/i);
  });

  it('blocks a cycle', () => {
    expect(() =>
      requireCurrentRoleSnapshotForMutation(
        completeRoleResult([
          snapshotData('snap-a', 'snap-b'),
          snapshotData('snap-b', 'snap-a'),
        ]),
      ),
    ).toThrow(/ambiguous|lineage/i);
  });

  it('blocks a fork', () => {
    expect(() =>
      requireCurrentRoleSnapshotForMutation(
        completeRoleResult([
          snapshotData('genesis'),
          snapshotData('child-1', 'genesis'),
          snapshotData('child-2', 'genesis'),
        ]),
      ),
    ).toThrow(/ambiguous|lineage/i);
  });

  it('allows a valid single lineage', () => {
    const snapshot = requireCurrentRoleSnapshotForMutation(
      completeRoleResult([
        snapshotData('genesis'),
        snapshotData('snap-2', 'genesis'),
      ]),
    );
    expect(snapshot.snapshotId).toBe('snap-2');
  });
});
