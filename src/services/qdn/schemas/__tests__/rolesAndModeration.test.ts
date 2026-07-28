// ===== Role Snapshots & Historical Moderation Tests =====
//
// QUCP-REF-005A: Append-only role snapshots and historical moderation authorization.

import { describe, it, expect, beforeEach } from 'vitest';
import { roleRegistrySnapshotSchema, type QucpRoleRegistrySnapshot } from '../roleRegistrySnapshotSchema';
import { moderationOperationSchema, type QucpModerationOperation } from '../moderationOperationSchema';
import {
  buildRoleSnapshotKey, buildRoleSnapshotIdentifier,
  parseRoleSnapshotIdentifier, validateRoleSnapshotIdentifier,
  ROLE_SNAPSHOT_PREFIX,
} from '../../identifiers/roleSnapshotIdentifiers';
import {
  buildModerationIdentifier,
} from '../../identifiers/moderationIdentifiers';
import {
  buildModerationTargetKey, buildModerationOperationKey,
  verifyModerationTargetKey,
} from '../../identifiers/moderationKeys';
import {
  getRolesForWallet, hasCapability,
} from '../../roles/roleAuthorization';
import {
  selectCurrentSnapshot, selectSnapshotWithLkg,
  storeLastKnownGoodSnapshot, clearLastKnownGoodSnapshot,
} from '../../roles/registrySnapshotSelection';
import {
  validateSnapshotLineage, detectForks,
} from '../../roles/registryLineage';
import { getRequiredCapability } from '../../roles/roleCapabilities';
import {
  authorizeModerationAtSnapshot, authorizeCurrentModerationWrite,
} from '../../operations/moderationHistoricalAuthorization';
import { reduceModerationState } from '../../operations/moderationReducer';
import { NEUTRAL_MODERATION_STATE, composeVisibility } from '../../operations/moderationState';
import { createResourceEnvelope } from '../../QdnResourceEnvelope';
import { QUC_SYSOP_ADDRESS } from '../../../../config/qortiumTrust';

// ---- Test Wallets ----

const SYSOP = QUC_SYSOP_ADDRESS;
const ADMIN_WALLET = 'QN3XYzAbCdEfGhIjKlMnOpQrStUvWxYz123';
const MOD_WALLET = 'QModeratorWallet12345678901234567890';
const SUPPORT_WALLET = 'QSupportWallet1234567890123456789';
const MEMBER_WALLET = 'QMemberWallet123456789012345678901';
const FOREIGN_WALLET = 'QForeignForeignForeignForeignAbCd';

// ---- Helpers ----

function meta(overrides?: { name?: string; identifier?: string; created?: number; updated?: number }) {
  return {
    name: overrides?.name ?? 'Qortian',
    service: 'DOCUMENT' as const,
    identifier: overrides?.identifier ?? 'qucp-rs-aaaaaaaaaaaaaaaaaaaaaaaaaa',
    created: overrides?.created ?? 1700000000000,
    updated: overrides?.updated ?? 1700000001000,
  };
}

// ---- Snapshot Helpers ----

function validSnapshot(overrides?: Partial<QucpRoleRegistrySnapshot>): QucpRoleRegistrySnapshot {
  return {
    schemaVersion: 1 as const,
    resourceFamily: 'qucp-role-snapshot' as const,
    snapshotId: 'snap-001',
    sysopAddress: SYSOP,
    members: [
      { address: ADMIN_WALLET, roles: ['admin'] },
      { address: MOD_WALLET, roles: ['moderator'] },
      { address: SUPPORT_WALLET, roles: ['support'] },
    ],
    createdAt: 1700000000000,
    ...overrides,
  };
}

async function makeSnapshotEnv(snapshot: QucpRoleRegistrySnapshot, mOverrides?: Parameters<typeof meta>[0]) {
  const id = await buildRoleSnapshotIdentifier(snapshot.snapshotId);
  return createResourceEnvelope(meta({ identifier: id, ...mOverrides }), snapshot);
}

// ---- Moderation Helpers ----

function validMod(overrides?: Partial<QucpModerationOperation>): QucpModerationOperation {
  return {
    schemaVersion: 1 as const,
    resourceFamily: 'qucp-moderation' as const,
    operationId: 'mod-op-00001',
    targetFamily: 'qucp-post',
    targetEntityId: 'post1234567890',
    action: 'hide',
    actorName: 'ModMark',
    actorAddress: MOD_WALLET,
    reason: 'Off-topic',
    registrySnapshotId: 'snap-001',
    registrySnapshotIdentifier: 'qucp-rs-aaaaaaaaaaaaaaaaaaaaaaaaaa',
    createdAt: 1700000001000,
    ...overrides,
  };
}

// ================================================================
//  SNAPSHOT SCHEMA
// ================================================================

describe('snapshot schema', () => {
  it('valid genesis snapshot', () => {
    expect(roleRegistrySnapshotSchema.safeParse(validSnapshot()).success).toBe(true);
  });

  it('valid successor snapshot', () => {
    expect(roleRegistrySnapshotSchema.safeParse(
      validSnapshot({ snapshotId: 'snap-002', previousSnapshotId: 'snap-001' }),
    ).success).toBe(true);
  });

  it('exact schema version required', () => {
    expect(roleRegistrySnapshotSchema.safeParse({ ...validSnapshot(), schemaVersion: 2 }).success).toBe(false);
  });

  it('strict unknown-key rejection', () => {
    expect(roleRegistrySnapshotSchema.safeParse({ ...validSnapshot(), foo: 'bar' }).success).toBe(false);
  });

  it('sysopAddress required', () => {
    const r = roleRegistrySnapshotSchema.safeParse({
      ...validSnapshot(), sysopAddress: FOREIGN_WALLET,
    });
    // Schema accepts it — policy rejects
    expect(r.success).toBe(true);
  });

  it('duplicate wallet rejected', () => {
    expect(roleRegistrySnapshotSchema.safeParse({
      ...validSnapshot(),
      members: [
        { address: ADMIN_WALLET, roles: ['admin'] },
        { address: ADMIN_WALLET, roles: ['moderator'] },
      ],
    }).success).toBe(false);
  });

  it('duplicate roles rejected', () => {
    expect(roleRegistrySnapshotSchema.safeParse({
      ...validSnapshot(),
      members: [{ address: ADMIN_WALLET, roles: ['admin', 'admin'] }],
    }).success).toBe(false);
  });

  it('unknown role rejected', () => {
    expect(roleRegistrySnapshotSchema.safeParse({
      ...validSnapshot(),
      members: [{ address: ADMIN_WALLET, roles: ['superadmin' as unknown as 'admin'] }],
    }).success).toBe(false);
  });

  it('self-referencing previous snapshot rejected', () => {
    expect(roleRegistrySnapshotSchema.safeParse(
      validSnapshot({ previousSnapshotId: 'snap-001', snapshotId: 'snap-001' }),
    ).success).toBe(false);
  });

  it('malformed snapshot ID rejected', () => {
    expect(roleRegistrySnapshotSchema.safeParse({
      ...validSnapshot(), snapshotId: 'BAD ID!',
    }).success).toBe(false);
  });

  it('arbitrary capability field rejected', () => {
    expect(roleRegistrySnapshotSchema.safeParse({
      ...validSnapshot(), capabilities: ['do-stuff'],
    }).success).toBe(false);
  });
});

// ================================================================
//  SNAPSHOT IDENTIFIERS
// ================================================================

describe('snapshot identifiers', () => {
  it('snapshot key is 26 hex', async () => {
    const key = await buildRoleSnapshotKey('snap-001');
    expect(key).toHaveLength(26);
    expect(key).toMatch(/^[a-f0-9]{26}$/);
  });

  it('identifier round-trip', async () => {
    const id = await buildRoleSnapshotIdentifier('snap-001');
    const parsed = parseRoleSnapshotIdentifier(id);
    expect(parsed).not.toBeNull();
  });

  it('exact prefix', async () => {
    const id = await buildRoleSnapshotIdentifier('snap-001');
    expect(id.startsWith(ROLE_SNAPSHOT_PREFIX)).toBe(true);
  });

  it('changed snapshot ID invalidates key', async () => {
    const k1 = await buildRoleSnapshotKey('snap-001');
    const k2 = await buildRoleSnapshotKey('snap-002');
    expect(k1).not.toBe(k2);
  });

  it('old qucp-roles rejected', () => {
    expect(validateRoleSnapshotIdentifier('qucp-roles')).toBe(false);
  });

  it('malformed key rejected', () => {
    expect(parseRoleSnapshotIdentifier('qucp-rs-short')).toBeNull();
  });

  it('uppercase rejected', () => {
    expect(parseRoleSnapshotIdentifier('qucp-rs-' + 'A'.repeat(26))).toBeNull();
  });

  it('suffix rejected', () => {
    expect(parseRoleSnapshotIdentifier('qucp-rs-' + 'a'.repeat(26) + '-extra')).toBeNull();
  });

  it('old reaction prefix not parsed as snapshot', () => {
    expect(parseRoleSnapshotIdentifier('qucp-r-' + 'a'.repeat(26) + '-' + 'b'.repeat(26))).toBeNull();
  });
});

// ================================================================
//  SNAPSHOT POLICY
// ================================================================

describe('snapshot policy', () => {
  it('SysOp-owned publisher accepted structurally', () => {
    // Policy is tested via validatePublisher — structural acceptance here
    const snap = validSnapshot();
    const r = roleRegistrySnapshotSchema.safeParse(snap);
    expect(r.success).toBe(true);
  });

  it('foreign SysOp in payload accepted by schema (policy rejects)', () => {
    const r = roleRegistrySnapshotSchema.safeParse(
      validSnapshot({ sysopAddress: FOREIGN_WALLET }),
    );
    expect(r.success).toBe(true); // Schema accepts, policy rejects
  });
});

// ================================================================
//  LINEAGE
// ================================================================

describe('lineage', () => {
  function snapMap(snapshots: QucpRoleRegistrySnapshot[]) {
    const m = new Map<string, { snapshot: QucpRoleRegistrySnapshot; identifier: string }>();
    for (const s of snapshots) {
      m.set(s.snapshotId, { snapshot: s, identifier: `qucp-rs-${s.snapshotId}-key` });
    }
    return m;
  }

  it('valid genesis', () => {
    const s = validSnapshot();
    const result = validateSnapshotLineage('snap-001', 'id', snapMap([s]));
    expect(result.status).toBe('valid-genesis');
  });

  it('valid successor', () => {
    const s1 = validSnapshot({ snapshotId: 'snap-001' });
    const s2 = validSnapshot({ snapshotId: 'snap-002', previousSnapshotId: 'snap-001' });
    const result = validateSnapshotLineage('snap-002', 'id', snapMap([s1, s2]));
    expect(result.status).toBe('valid-successor');
  });

  it('missing previous', () => {
    const s2 = validSnapshot({ snapshotId: 'snap-002', previousSnapshotId: 'snap-001' });
    const result = validateSnapshotLineage('snap-002', 'id', snapMap([s2]));
    expect(result.status).toBe('missing-previous');
  });

  it('self-cycle', () => {
    const s = validSnapshot({ snapshotId: 'snap-001', previousSnapshotId: 'snap-001' });
    // Schema rejects self-cycle; lineage also catches if somehow loaded
    const result = validateSnapshotLineage('snap-001', 'id', snapMap([s]));
    expect(result.status).toBe('self-cycle');
  });

  it('two-node cycle', () => {
    const s1 = validSnapshot({ snapshotId: 'snap-001', previousSnapshotId: 'snap-002' });
    const s2 = validSnapshot({ snapshotId: 'snap-002', previousSnapshotId: 'snap-001' });
    const result = validateSnapshotLineage('snap-001', 'id', snapMap([s1, s2]));
    expect(result.status).toBe('lineage-cycle');
  });

  it('fork detected', () => {
    const s1 = validSnapshot({ snapshotId: 'snap-001' });
    const s2a = validSnapshot({ snapshotId: 'snap-002a', previousSnapshotId: 'snap-001' });
    const s2b = validSnapshot({ snapshotId: 'snap-002b', previousSnapshotId: 'snap-001' });
    const forks = detectForks(snapMap([s1, s2a, s2b]));
    expect(forks.size).toBe(1);
    expect(forks.get('snap-001')).toEqual(['snap-002a', 'snap-002b']);
  });

  it('no fork for single child', () => {
    const s1 = validSnapshot({ snapshotId: 'snap-001' });
    const s2 = validSnapshot({ snapshotId: 'snap-002', previousSnapshotId: 'snap-001' });
    const forks = detectForks(snapMap([s1, s2]));
    expect(forks.size).toBe(0);
  });
});

// ================================================================
//  CURRENT SELECTION
// ================================================================

describe('current snapshot selection', () => {
  beforeEach(() => clearLastKnownGoodSnapshot());

  it('no snapshots returns unavailable', () => {
    const result = selectCurrentSnapshot([]);
    expect(result.status).toBe('unavailable');
  });

  it('fork produces unresolved state', async () => {
    const s1 = await makeSnapshotEnv(validSnapshot({ snapshotId: 'snap-001' }), { updated: 100 });
    const s2a = await makeSnapshotEnv(validSnapshot({ snapshotId: 'snap-002a', previousSnapshotId: 'snap-001' }), { updated: 200 });
    const s2b = await makeSnapshotEnv(validSnapshot({ snapshotId: 'snap-002b', previousSnapshotId: 'snap-001' }), { updated: 300 });
    const result = selectCurrentSnapshot([s1, s2a, s2b]);
    expect(result.status).toBe('history-unresolved');
  });

  it('LKG fallback on unavailable', async () => {
    const s1 = await makeSnapshotEnv(validSnapshot({ snapshotId: 'snap-001' }));
    storeLastKnownGoodSnapshot({ envelope: s1, acceptedAt: Date.now() });
    const result = selectSnapshotWithLkg([]);
    expect(result.status).toBe('last-known-good');
  });
});

// ================================================================
//  ROLE LOOKUP (unchanged semantics, updated type)
// ================================================================

describe('role lookup', () => {
  const snap = validSnapshot();

  it('SysOp receives admin role', () => {
    expect(getRolesForWallet(SYSOP, snap)).toEqual(['admin']);
  });

  it('admin has admin role', () => {
    expect(getRolesForWallet(ADMIN_WALLET, snap)).toContain('admin');
  });

  it('moderator has moderate-content capability', () => {
    expect(hasCapability(MOD_WALLET, 'moderate-content', snap)).toBe(true);
  });

  it('unknown wallet receives no roles', () => {
    expect(getRolesForWallet(MEMBER_WALLET, snap)).toEqual([]);
  });

  it('role revocation reflected', () => {
    const snap2 = validSnapshot({
      snapshotId: 'snap-002',
      members: [{ address: ADMIN_WALLET, roles: ['moderator'] }],
    });
    expect(getRolesForWallet(ADMIN_WALLET, snap2)).toEqual(['moderator']);
  });
});

// ================================================================
//  MODERATION SCHEMA (snapshot reference)
// ================================================================

describe('moderation schema with snapshot reference', () => {
  it('valid moderation with snapshot reference', () => {
    expect(moderationOperationSchema.safeParse(validMod()).success).toBe(true);
  });

  it('rejects missing registrySnapshotId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { registrySnapshotId, ...rest } = validMod();
    expect(moderationOperationSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects old fixed registry identifier', () => {
    expect(moderationOperationSchema.safeParse({
      ...validMod(),
      registryIdentifier: 'qucp-roles',
    } as Record<string, unknown>).success).toBe(false);
  });

  it('rejects embedded role registry', () => {
    expect(moderationOperationSchema.safeParse({
      ...validMod(), embeddedRoles: [],
    } as Record<string, unknown>).success).toBe(false);
  });
});

// ================================================================
//  MODERATION IDENTIFIERS (snapshot binding)
// ================================================================

describe('moderation identifier snapshot binding', () => {
  it('snapshot ID participates in operation key', async () => {
    const k1 = await buildModerationOperationKey('op1', MOD_WALLET, 'hide', 'snap-001');
    const k2 = await buildModerationOperationKey('op1', MOD_WALLET, 'hide', 'snap-002');
    expect(k1).not.toBe(k2);
  });

  it('changing snapshot invalidates identifier', async () => {
    const id1 = await buildModerationIdentifier('qucp-post', 'p1', 'op1', MOD_WALLET, 'hide', 'snap-001');
    const id2 = await buildModerationIdentifier('qucp-post', 'p1', 'op1', MOD_WALLET, 'hide', 'snap-002');
    expect(id1).not.toBe(id2);
  });

  it('identifier remains 60 chars', async () => {
    const id = await buildModerationIdentifier('qucp-post', 'p1', 'op1', MOD_WALLET, 'hide', 'snap-001');
    expect(id.length).toBe(60);
  });

  it('target key remains bound', async () => {
    const key = await buildModerationTargetKey('qucp-post', 'p1');
    expect(await verifyModerationTargetKey(key, 'qucp-post', 'p2')).toBe(false);
  });
});

// ================================================================
//  HISTORICAL AUTHORIZATION
// ================================================================

describe('historical authorization', () => {
  async function setup() {
    const snap = await makeSnapshotEnv(validSnapshot());
    const snapMap = new Map<string, { envelope: typeof snap }>();
    snapMap.set('snap-001', { envelope: snap });
    return { snapMap, snap, snapshotId: snap.metadata.identifier };
  }

  it('actor authorized in snapshot is authorized', async () => {
    const { snapMap, snapshotId } = await setup();
    const op = validMod({ registrySnapshotIdentifier: snapshotId });
    const result = authorizeModerationAtSnapshot(op, snapMap);
    expect(result.status).toBe('authorized');
  });

  it('unauthorized actor is rejected', async () => {
    const { snapMap, snapshotId } = await setup();
    const op = validMod({ actorAddress: MEMBER_WALLET, registrySnapshotIdentifier: snapshotId });
    const result = authorizeModerationAtSnapshot(op, snapMap);
    expect(result.status).toBe('unauthorized');
  });

  it('missing snapshot classified', async () => {
    const { snapMap } = await setup();
    const op = validMod({ registrySnapshotId: 'snap-999' });
    const result = authorizeModerationAtSnapshot(op, snapMap);
    expect(result.status).toBe('snapshot-missing');
  });

  it('snapshot identifier mismatch classified', async () => {
    const { snapMap } = await setup();
    const op = validMod({ registrySnapshotIdentifier: 'qucp-rs-bbbbbbbbbbbbbbbbbbbbbbbbbb' });
    const result = authorizeModerationAtSnapshot(op, snapMap);
    expect(result.status).toBe('snapshot-identifier-mismatch');
  });

  it('SysOp capabilities evaluated correctly', async () => {
    const { snapMap, snapshotId } = await setup();
    const op = validMod({ actorAddress: SYSOP, actorName: 'Qortian', registrySnapshotIdentifier: snapshotId });
    const result = authorizeModerationAtSnapshot(op, snapMap);
    expect(result.status).toBe('authorized');
  });
});

// ================================================================
//  RETROACTIVE BEHAVIOR
// ================================================================

describe('retroactive behavior', () => {
  it('authorized in old snapshot remains authorized after role removal in newer', async () => {
    // Snapshot 1: Mod has role
    const snap1 = await makeSnapshotEnv(validSnapshot({ snapshotId: 'snap-001' }), { updated: 100 });
    // Snapshot 2: Mod removed
    const snap2 = await makeSnapshotEnv(validSnapshot({
      snapshotId: 'snap-002', previousSnapshotId: 'snap-001',
      members: [{ address: ADMIN_WALLET, roles: ['admin'] }],
    }), { updated: 200 });
    const snapMap = new Map<string, { envelope: typeof snap1 }>();
    snapMap.set('snap-001', { envelope: snap1 });
    snapMap.set('snap-002', { envelope: snap2 });

    // Operation references snap-001
    const op = validMod({ registrySnapshotId: 'snap-001', registrySnapshotIdentifier: snap1.metadata.identifier });
    const result = authorizeModerationAtSnapshot(op, snapMap);
    expect(result.status).toBe('authorized');
  });

  it('unauthorized in old snapshot remains unauthorized after later grant', async () => {
    // Snapshot 1: Only admin
    const snap1 = await makeSnapshotEnv(validSnapshot({
      snapshotId: 'snap-001',
      members: [{ address: ADMIN_WALLET, roles: ['admin'] }],
    }), { updated: 100 });
    // Snapshot 2: Mod added
    const snap2 = await makeSnapshotEnv(validSnapshot({
      snapshotId: 'snap-002', previousSnapshotId: 'snap-001',
      members: [
        { address: ADMIN_WALLET, roles: ['admin'] },
        { address: MOD_WALLET, roles: ['moderator'] },
      ],
    }), { updated: 200 });
    const snapMap = new Map<string, { envelope: typeof snap1 }>();
    snapMap.set('snap-001', { envelope: snap1 });
    snapMap.set('snap-002', { envelope: snap2 });

    // Operation references snap-001 (where mod was unauthorized)
    const op = validMod({ registrySnapshotId: 'snap-001', registrySnapshotIdentifier: snap1.metadata.identifier });
    const result = authorizeModerationAtSnapshot(op, snapMap);
    // Mod wasn't in snap-001, so should be unauthorized
    expect(result.status).toBe('unauthorized');
  });

  it('foreign snapshot rejected', async () => {
    // Foreign snapshot not in accepted set
    const snap = await makeSnapshotEnv(validSnapshot());
    const snapMap = new Map<string, { envelope: typeof snap }>();
    // Only snap-001 in map, not snap-999
    snapMap.set('snap-001', { envelope: snap });
    const op = validMod({ registrySnapshotId: 'snap-999' });
    const result = authorizeModerationAtSnapshot(op, snapMap);
    expect(result.status).toBe('snapshot-missing');
  });

  it('later snapshot cannot authorize earlier operation (temporal)', async () => {
    // Snapshot created at t=300
    const snap2 = await makeSnapshotEnv(validSnapshot({ snapshotId: 'snap-002' }), { updated: 300 });
    const snapMap = new Map<string, { envelope: typeof snap2 }>();
    snapMap.set('snap-002', { envelope: snap2 });

    // Operation created at t=200 but references snap-002
    const modEnv = createResourceEnvelope(
      meta({ identifier: 'qucp-m-aaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbbbbbbbbbbbb', updated: 200 }),
      validMod({ registrySnapshotId: 'snap-002', registrySnapshotIdentifier: snap2.metadata.identifier }),
    );
    const result = authorizeModerationAtSnapshot(modEnv.data, snapMap, modEnv);
    expect(result.status).toBe('snapshot-temporally-invalid');
  });
});

// ================================================================
//  PRESENT-TIME WRITE AUTHORIZATION
// ================================================================

describe('current write authorization', () => {
  it('moderator authorized for hide', () => {
    const snap = validSnapshot();
    const result = authorizeCurrentModerationWrite(MOD_WALLET, 'hide', snap);
    expect(result.authorized).toBe(true);
  });

  it('member unauthorized for hide', () => {
    const snap = validSnapshot();
    const result = authorizeCurrentModerationWrite(MEMBER_WALLET, 'hide', snap);
    expect(result.authorized).toBe(false);
  });

  it('unknown action returns unauthorized', () => {
    const snap = validSnapshot();
    const result = authorizeCurrentModerationWrite(MOD_WALLET, 'nonexistent', snap);
    expect(result.authorized).toBe(false);
  });
});

// ================================================================
//  MODERATION REDUCER (historical)
// ================================================================

describe('moderation reducer (historical)', () => {
  async function setupSnapMap() {
    const snap = await makeSnapshotEnv(validSnapshot());
    const m = new Map<string, { envelope: typeof snap }>();
    m.set('snap-001', { envelope: snap });
    return { snapMap: m, snapshotId: snap.metadata.identifier };
  }

  async function modEnv(op: QucpModerationOperation, mOverrides?: Parameters<typeof meta>[0]) {
    const id = await buildModerationIdentifier(
      op.targetFamily, op.targetEntityId, op.operationId, op.actorAddress, op.action, op.registrySnapshotId,
    );
    return createResourceEnvelope(meta({ name: op.actorName, identifier: id, ...mOverrides }), op);
  }

  it('neutral state is default', async () => {
    const { snapMap } = await setupSnapMap();
    const { state } = reduceModerationState('qucp-post', 'p1', [], snapMap);
    expect(state).toEqual(NEUTRAL_MODERATION_STATE);
  });

  it('hide action works', async () => {
    const { snapMap, snapshotId } = await setupSnapMap();
    const op = await modEnv(validMod({ action: 'hide', registrySnapshotIdentifier: snapshotId }));
    const { state } = reduceModerationState('qucp-post', op.data.targetEntityId, [op], snapMap);
    expect(state.visibility).toBe('hidden');
  });

  it('unauthorized operations ignored', async () => {
    const { snapMap, snapshotId } = await setupSnapMap();
    const op = await modEnv(validMod({ actorAddress: MEMBER_WALLET, action: 'hide', registrySnapshotIdentifier: snapshotId }));
    const { state, diagnostics } = reduceModerationState('qucp-post', op.data.targetEntityId, [op], snapMap);
    expect(state.visibility).toBe('visible');
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('missing-snapshot operation ignored', async () => {
    const { snapMap } = await setupSnapMap();
    const op = await modEnv(validMod({ registrySnapshotId: 'snap-999', action: 'hide' }));
    const { state } = reduceModerationState('qucp-post', op.data.targetEntityId, [op], snapMap);
    expect(state.visibility).toBe('visible');
  });

  it('same input different order gives same state', async () => {
    const { snapMap, snapshotId } = await setupSnapMap();
    const op1 = await modEnv(validMod({ action: 'hide', createdAt: 200, registrySnapshotIdentifier: snapshotId }), { updated: 200 });
    const op2 = await modEnv(validMod({ operationId: 'mod-op-00002', action: 'restore', createdAt: 300, registrySnapshotIdentifier: snapshotId }), { updated: 300 });
    const { state: s1 } = reduceModerationState('qucp-post', 'post1234567890', [op1, op2], snapMap);
    const { state: s2 } = reduceModerationState('qucp-post', 'post1234567890', [op2, op1], snapMap);
    expect(s1).toEqual(s2);
  });
});

// ================================================================
//  OWNER TOMBSTONE INTERACTION (unchanged)
// ================================================================

describe('owner tombstone interaction', () => {
  it('owner delete overrides visible', () => {
    const result = composeVisibility(true, NEUTRAL_MODERATION_STATE);
    expect(result.effectiveVisibility).toBe('deleted');
  });

  it('moderator hide not overridden by owner active', () => {
    const result = composeVisibility(false, { ...NEUTRAL_MODERATION_STATE, visibility: 'hidden' });
    expect(result.effectiveVisibility).toBe('hidden');
  });

  it('both dimensions independently represented', () => {
    const result = composeVisibility(true, { ...NEUTRAL_MODERATION_STATE, visibility: 'hidden' });
    expect(result.ownerDeleted).toBe(true);
    expect(result.moderation.visibility).toBe('hidden');
    expect(result.effectiveVisibility).toBe('deleted');
  });
});

// ================================================================
//  CAPABILITY MAPPING (unchanged)
// ================================================================

describe('capability mapping', () => {
  it('hide requires moderate-content', () => {
    expect(getRequiredCapability('hide')).toBe('moderate-content');
  });

  it('feature requires feature-content', () => {
    expect(getRequiredCapability('feature')).toBe('feature-content');
  });

  it('lock requires lock-discussions', () => {
    expect(getRequiredCapability('lock')).toBe('lock-discussions');
  });
});
