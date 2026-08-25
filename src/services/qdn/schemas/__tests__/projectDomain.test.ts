// ===== Project Schema & Runtime Architecture Tests =====
//
// QUCP-PROJECTS-001: Project schema, identifiers, policies,
// lifecycle transitions, snapshot reduction, and funding metadata.

import { describe, it, expect } from 'vitest';
import { projectSchema, type QucpProject, PROJECT_IMMUTABLE_FIELDS, isApprovedLifecycleTransition, VALID_LIFECYCLE_TRANSITIONS, type ProjectStatus } from '../projectSchema';
import { reduceProjectSnapshots } from '../../runtime/projectSnapshotReducer';
import type { QdnResourceEnvelope } from '../../QdnResourceEnvelope';

// ---- Test Wallets ----
const OWNER = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const FOREIGN = 'QForeignForeignForeignForeignAbCd';

// ---- Helpers ----

function validProject(overrides?: Partial<QucpProject>): QucpProject {
  return {
    schemaVersion: 1 as const,
    resourceFamily: 'qucp-project' as const,
    entityId: 'proj00001',
    title: 'Test Project',
    description: 'A test project description.',
    status: 'planned',
    tags: ['dev', 'test'],
    ownerName: 'Alice',
    ownerAddress: OWNER,
    createdAt: 1700000000000,
    ...overrides,
  };
}

function envelope(
  data: QucpProject,
  overrides?: Partial<QdnResourceEnvelope<QucpProject>['metadata']>,
): QdnResourceEnvelope<QucpProject> {
  return {
    data,
    metadata: {
      name: data.ownerName,
      service: 'DOCUMENT',
      identifier: `qucp-project-${data.entityId}`,
      created: data.createdAt,
      ...overrides,
    },
    resolvedPublisherAddress: data.ownerAddress,
    source: 'qdn',
  };
}

// ================================================================
//  PROJECT SCHEMA
// ================================================================

describe('project schema', () => {
  it('valid project accepted', () => {
    expect(projectSchema.safeParse(validProject()).success).toBe(true);
  });

  it('exact schema version', () => {
    expect(projectSchema.safeParse({ ...validProject(), schemaVersion: 2 }).success).toBe(false);
  });

  it('exact resource family', () => {
    expect(projectSchema.safeParse({ ...validProject(), resourceFamily: 'qucp-post' }).success).toBe(false);
  });

  it('valid status values', () => {
    for (const status of ['planned', 'active', 'completed', 'archived'] as ProjectStatus[]) {
      expect(projectSchema.safeParse(validProject({ status })).success).toBe(true);
    }
  });

  it('invalid status rejected', () => {
    expect(projectSchema.safeParse({ ...validProject(), status: 'paused' }).success).toBe(false);
  });

  it('title required', () => {
    expect(projectSchema.safeParse({ ...validProject(), title: '' }).success).toBe(false);
  });

  it('title max 200 chars', () => {
    expect(projectSchema.safeParse(validProject({ title: 'a'.repeat(200) })).success).toBe(true);
    expect(projectSchema.safeParse(validProject({ title: 'a'.repeat(201) })).success).toBe(false);
  });

  it('description required', () => {
    expect(projectSchema.safeParse({ ...validProject(), description: '' }).success).toBe(false);
  });

  it('description max 5000 chars', () => {
    expect(projectSchema.safeParse(validProject({ description: 'a'.repeat(5000) })).success).toBe(true);
  });

  it('tags max 10', () => {
    expect(projectSchema.safeParse(validProject({ tags: Array.from({ length: 10 }, (_, i) => `tag${i}`) })).success).toBe(true);
    expect(projectSchema.safeParse(validProject({ tags: Array.from({ length: 11 }, (_, i) => `tag${i}`) })).success).toBe(false);
  });

  it('website optional URL format', () => {
    expect(projectSchema.safeParse(validProject({ website: 'https://example.com' })).success).toBe(true);
    expect(projectSchema.safeParse(validProject({ website: 'not-a-url' })).success).toBe(false);
  });

  it('repository optional URL format', () => {
    expect(projectSchema.safeParse(validProject({ repository: 'https://github.com/org/repo' })).success).toBe(true);
    expect(projectSchema.safeParse(validProject({ repository: 'not-a-url' })).success).toBe(false);
  });

  it('donationAddress and fundingGoal: donationAddress alone valid', () => {
    expect(projectSchema.safeParse(validProject({ donationAddress: OWNER })).success).toBe(true);
  });

  it('donationAddress and fundingGoal: both present valid', () => {
    expect(projectSchema.safeParse(validProject({ donationAddress: OWNER, fundingGoal: 10000 })).success).toBe(true);
  });

  it('fundingGoal without donationAddress rejected', () => {
    expect(projectSchema.safeParse(validProject({ fundingGoal: 10000 })).success).toBe(false);
  });

  it('both absent valid', () => {
    const proj = validProject();
    delete (proj as Record<string, unknown>).donationAddress;
    delete (proj as Record<string, unknown>).fundingGoal;
    expect(projectSchema.safeParse(proj).success).toBe(true);
  });

  it('donation address: valid Q-address accepted', () => {
    expect(projectSchema.safeParse(validProject({ donationAddress: OWNER })).success).toBe(true);
  });

  it('donation address: invalid alphabet rejected', () => {
    expect(projectSchema.safeParse(validProject({ donationAddress: '0'.repeat(33) })).success).toBe(false);
  });

  it('donation address: too short rejected', () => {
    expect(projectSchema.safeParse(validProject({ donationAddress: 'Qab' })).success).toBe(false);
  });

  it('donation address: empty string rejected', () => {
    expect(projectSchema.safeParse({ ...validProject(), donationAddress: '' })).toHaveProperty('success', false);
  });

  it('rejects unknown keys', () => {
    expect(projectSchema.safeParse({ ...validProject(), progress: 50 }).success).toBe(false);
  });

  it('rejects fundingReceived', () => {
    expect(projectSchema.safeParse({ ...validProject(), fundingReceived: 5000 }).success).toBe(false);
  });

  it('rejects donorCount', () => {
    expect(projectSchema.safeParse({ ...validProject(), donorCount: 10 }).success).toBe(false);
  });

  it('rejects fundingPercentage', () => {
    expect(projectSchema.safeParse({ ...validProject(), fundingPercentage: 50 }).success).toBe(false);
  });

  it('rejects leadName', () => {
    expect(projectSchema.safeParse({ ...validProject(), leadName: 'Admin' }).success).toBe(false);
  });

  it('empty tags accepted', () => {
    expect(projectSchema.safeParse(validProject({ tags: [] })).success).toBe(true);
  });

  it('entityId minimum 8 chars', () => {
    expect(projectSchema.safeParse(validProject({ entityId: 'proj0001' })).success).toBe(true);
    expect(projectSchema.safeParse(validProject({ entityId: 'proj00' })).success).toBe(false);
  });
});

// ================================================================
//  LIFECYCLE TRANSITIONS
// ================================================================

describe('lifecycle transitions', () => {
  it('planned → active approved', () => {
    expect(isApprovedLifecycleTransition('planned', 'active')).toBe(true);
  });

  it('planned → archived approved', () => {
    expect(isApprovedLifecycleTransition('planned', 'archived')).toBe(true);
  });

  it('active → completed approved', () => {
    expect(isApprovedLifecycleTransition('active', 'completed')).toBe(true);
  });

  it('active → archived approved', () => {
    expect(isApprovedLifecycleTransition('active', 'archived')).toBe(true);
  });

  it('completed → archived approved', () => {
    expect(isApprovedLifecycleTransition('completed', 'archived')).toBe(true);
  });

  it('planned → planned same-state approved', () => {
    expect(isApprovedLifecycleTransition('planned', 'planned')).toBe(true);
  });

  it('active → active same-state approved', () => {
    expect(isApprovedLifecycleTransition('active', 'active')).toBe(true);
  });

  it('completed → completed same-state approved', () => {
    expect(isApprovedLifecycleTransition('completed', 'completed')).toBe(true);
  });

  it('planned → completed rejected', () => {
    expect(isApprovedLifecycleTransition('planned', 'completed')).toBe(false);
  });

  it('active → planned rejected', () => {
    expect(isApprovedLifecycleTransition('active', 'planned')).toBe(false);
  });

  it('completed → active rejected', () => {
    expect(isApprovedLifecycleTransition('completed', 'active')).toBe(false);
  });

  it('completed → planned rejected', () => {
    expect(isApprovedLifecycleTransition('completed', 'planned')).toBe(false);
  });

  it('archived → any rejected (terminal)', () => {
    expect(isApprovedLifecycleTransition('archived', 'archived')).toBe(false);
    expect(isApprovedLifecycleTransition('archived', 'planned')).toBe(false);
    expect(isApprovedLifecycleTransition('archived', 'active')).toBe(false);
    expect(isApprovedLifecycleTransition('archived', 'completed')).toBe(false);
  });

  it('VALID_LIFECYCLE_TRANSITIONS has correct entries', () => {
    expect(VALID_LIFECYCLE_TRANSITIONS.planned).toEqual(['planned', 'active', 'archived']);
    expect(VALID_LIFECYCLE_TRANSITIONS.active).toEqual(['active', 'completed', 'archived']);
    expect(VALID_LIFECYCLE_TRANSITIONS.completed).toEqual(['completed', 'archived']);
    expect(VALID_LIFECYCLE_TRANSITIONS.archived).toEqual([]);
  });
});

// ================================================================
//  IMMUTABLE FIELDS
// ================================================================

describe('immutable fields', () => {
  it('immutable fields defined', () => {
    expect(PROJECT_IMMUTABLE_FIELDS).toContain('entityId');
    expect(PROJECT_IMMUTABLE_FIELDS).toContain('ownerName');
    expect(PROJECT_IMMUTABLE_FIELDS).toContain('ownerAddress');
    expect(PROJECT_IMMUTABLE_FIELDS).toContain('donationAddress');
    expect(PROJECT_IMMUTABLE_FIELDS).toContain('fundingGoal');
    expect(PROJECT_IMMUTABLE_FIELDS).toContain('schemaVersion');
    expect(PROJECT_IMMUTABLE_FIELDS).toContain('resourceFamily');
    expect(PROJECT_IMMUTABLE_FIELDS).toContain('createdAt');
  });

  it('title and status are not immutable', () => {
    expect(PROJECT_IMMUTABLE_FIELDS).not.toContain('title');
    expect(PROJECT_IMMUTABLE_FIELDS).not.toContain('status');
    expect(PROJECT_IMMUTABLE_FIELDS).not.toContain('description');
    expect(PROJECT_IMMUTABLE_FIELDS).not.toContain('tags');
  });
});

// ================================================================
//  SNAPSHOT REDUCTION
// ================================================================

describe('project snapshot reduction', () => {
  const BASE_TIME = 1700000000000;

  it('single planned snapshot yields canonical project', () => {
    const proj = validProject({ status: 'planned' });
    const result = reduceProjectSnapshots('proj00001', [envelope(proj)]);
    expect(result.project).not.toBeNull();
    expect(result.project!.status).toBe('planned');
    expect(result.project!.canonicalOwnerWallet).toBe(OWNER);
    expect(result.project!.canonicalOwnerName).toBe('Alice');
    expect(result.rejectedCount).toBe(0);
  });

  it('single active snapshot accepted', () => {
    const proj = validProject({ entityId: 'proj00002', status: 'active' });
    const result = reduceProjectSnapshots('proj00002', [envelope(proj)]);
    expect(result.project).not.toBeNull();
    expect(result.project!.status).toBe('active');
  });

  it('single completed snapshot is canonical after overwrite', () => {
    const proj = validProject({ entityId: 'proj00003', status: 'completed' });
    const result = reduceProjectSnapshots('proj00003', [envelope(proj)]);
    expect(result.project).not.toBeNull();
    expect(result.project!.status).toBe('completed');
  });

  it('single archived snapshot is canonical after overwrite', () => {
    const proj = validProject({ entityId: 'proj00004', status: 'archived' });
    const result = reduceProjectSnapshots('proj00004', [envelope(proj)]);
    expect(result.project).not.toBeNull();
    expect(result.project!.status).toBe('archived');
  });

  it('empty snapshots returns null', () => {
    const result = reduceProjectSnapshots('proj00001', []);
    expect(result.project).toBeNull();
    expect(result.rejectedCount).toBe(0);
  });

  it('latest snapshot publisher is canonical owner', () => {
    const early = validProject({ entityId: 'proj00001', status: 'planned', ownerAddress: OWNER, createdAt: BASE_TIME });
    const later = validProject({ entityId: 'proj00001', status: 'active', ownerAddress: FOREIGN, createdAt: BASE_TIME });
    const result = reduceProjectSnapshots('proj00001', [
      envelope(later, { created: BASE_TIME + 1000 }),
      envelope(early, { created: BASE_TIME }),
    ]);
    expect(result.project!.canonicalOwnerWallet).toBe(FOREIGN);
    expect(result.project!.status).toBe('active');
    expect(result.rejectedCount).toBe(0);
  });

  it('latest snapshot wins (planned → active)', () => {
    const proj1 = validProject({ entityId: 'proj00001', status: 'planned', createdAt: BASE_TIME });
    const proj2 = validProject({ entityId: 'proj00001', status: 'active', createdAt: BASE_TIME });
    const result = reduceProjectSnapshots('proj00001', [
      envelope(proj1, { created: BASE_TIME }),
      envelope(proj2, { created: BASE_TIME + 1000 }),
    ]);
    expect(result.project!.status).toBe('active');
    expect(result.rejectedCount).toBe(0);
  });

  it('latest snapshot wins (planned → completed)', () => {
    const proj1 = validProject({ entityId: 'proj00001', status: 'planned', createdAt: BASE_TIME });
    const proj2 = validProject({ entityId: 'proj00001', status: 'completed', createdAt: BASE_TIME });
    const result = reduceProjectSnapshots('proj00001', [
      envelope(proj1, { created: BASE_TIME }),
      envelope(proj2, { created: BASE_TIME + 1000 }),
    ]);
    expect(result.project!.status).toBe('completed');
    expect(result.rejectedCount).toBe(0);
  });

  it('latest snapshot wins (active → planned)', () => {
    const proj1 = validProject({ entityId: 'proj00001', status: 'active', createdAt: BASE_TIME });
    const proj2 = validProject({ entityId: 'proj00001', status: 'planned', createdAt: BASE_TIME });
    const result = reduceProjectSnapshots('proj00001', [
      envelope(proj1, { created: BASE_TIME }),
      envelope(proj2, { created: BASE_TIME + 1000 }),
    ]);
    expect(result.project!.status).toBe('planned');
    expect(result.rejectedCount).toBe(0);
  });

  it('latest snapshot content is authoritative (no retained history)', () => {
    const proj1 = validProject({ entityId: 'proj00001', status: 'planned', createdAt: BASE_TIME });
    const proj2 = validProject({ entityId: 'proj00001', status: 'active', ownerName: 'Bob', createdAt: BASE_TIME });
    const result = reduceProjectSnapshots('proj00001', [
      envelope(proj1, { created: BASE_TIME }),
      envelope(proj2, { created: BASE_TIME + 1000 }),
    ]);
    expect(result.rejectedCount).toBe(0);
    expect(result.project!.canonicalOwnerName).toBe('Bob');
  });

  it('same-state update accepted (title change)', () => {
    const proj1 = validProject({ entityId: 'proj00001', status: 'active', title: 'Original', createdAt: BASE_TIME });
    const proj2 = validProject({ entityId: 'proj00001', status: 'active', title: 'Updated', createdAt: BASE_TIME });
    const result = reduceProjectSnapshots('proj00001', [
      envelope(proj1, { created: BASE_TIME }),
      envelope(proj2, { created: BASE_TIME + 1000 }),
    ]);
    expect(result.project!.snapshot.data.title).toBe('Updated');
    expect(result.rejectedCount).toBe(0);
  });

  it('latest terminal snapshot is canonical across lifecycle inputs', () => {
    const snapshots = [
      envelope(validProject({ entityId: 'proj00001', status: 'planned', createdAt: BASE_TIME }), { created: BASE_TIME }),
      envelope(validProject({ entityId: 'proj00001', status: 'active', createdAt: BASE_TIME }), { created: BASE_TIME + 1000 }),
      envelope(validProject({ entityId: 'proj00001', status: 'completed', createdAt: BASE_TIME }), { created: BASE_TIME + 2000 }),
      envelope(validProject({ entityId: 'proj00001', status: 'archived', createdAt: BASE_TIME }), { created: BASE_TIME + 3000 }),
    ];
    const result = reduceProjectSnapshots('proj00001', snapshots);
    expect(result.project!.status).toBe('archived');
    expect(result.rejectedCount).toBe(0);
  });

  it('direct archive (planned → archived) produces archived', () => {
    const snapshots = [
      envelope(validProject({ entityId: 'proj00001', status: 'planned', createdAt: BASE_TIME }), { created: BASE_TIME }),
      envelope(validProject({ entityId: 'proj00001', status: 'archived', createdAt: BASE_TIME }), { created: BASE_TIME + 1000 }),
    ];
    const result = reduceProjectSnapshots('proj00001', snapshots);
    expect(result.project!.status).toBe('archived');
    expect(result.rejectedCount).toBe(0);
  });

  it('archived terminal state survives a single-coordinate read', () => {
    const snapshots = [
      envelope(validProject({ entityId: 'proj00001', status: 'archived', createdAt: BASE_TIME }), { created: BASE_TIME + 1000 }),
    ];
    const result = reduceProjectSnapshots('proj00001', snapshots);
    expect(result.project!.status).toBe('archived');
    expect(result.rejectedCount).toBe(0);
  });

  it('latest snapshot content wins even after archived', () => {
    const snapshots = [
      envelope(validProject({ entityId: 'proj00001', status: 'planned', createdAt: BASE_TIME }), { created: BASE_TIME }),
      envelope(validProject({ entityId: 'proj00001', status: 'archived', createdAt: BASE_TIME }), { created: BASE_TIME + 1000 }),
      envelope(validProject({ entityId: 'proj00001', status: 'archived', title: 'Changed', createdAt: BASE_TIME }), { created: BASE_TIME + 2000 }),
    ];
    const result = reduceProjectSnapshots('proj00001', snapshots);
    expect(result.project!.status).toBe('archived');
    expect(result.rejectedCount).toBe(0);
    expect(result.project!.snapshot.data.title).toBe('Changed');
  });

  it('latest snapshot funding metadata is authoritative', () => {
    const proj1 = validProject({ entityId: 'proj00001', status: 'planned', donationAddress: OWNER, fundingGoal: 10000, createdAt: BASE_TIME });
    const proj2 = validProject({ entityId: 'proj00001', status: 'active', donationAddress: FOREIGN, fundingGoal: 20000, createdAt: BASE_TIME });
    const result = reduceProjectSnapshots('proj00001', [
      envelope(proj1, { created: BASE_TIME }),
      envelope(proj2, { created: BASE_TIME + 1000 }),
    ]);
    expect(result.rejectedCount).toBe(0);
    expect(result.project!.snapshot.data.donationAddress).toBe(FOREIGN);
    expect(result.project!.snapshot.data.fundingGoal).toBe(20000);
  });

  it('tags can change across updates', () => {
    const proj1 = validProject({ entityId: 'proj00001', status: 'planned', tags: ['old'], createdAt: BASE_TIME });
    const proj2 = validProject({ entityId: 'proj00001', status: 'active', tags: ['new', 'updated'], createdAt: BASE_TIME });
    const result = reduceProjectSnapshots('proj00001', [
      envelope(proj1, { created: BASE_TIME }),
      envelope(proj2, { created: BASE_TIME + 1000 }),
    ]);
    expect(result.project!.snapshot.data.tags).toEqual(['new', 'updated']);
    expect(result.rejectedCount).toBe(0);
  });

  it('snapshot permutation produces same result', () => {
    const proj1 = validProject({ entityId: 'proj00001', status: 'planned', createdAt: BASE_TIME });
    const proj2 = validProject({ entityId: 'proj00001', status: 'active', createdAt: BASE_TIME });
    const proj3 = validProject({ entityId: 'proj00001', status: 'completed', createdAt: BASE_TIME });

    const order1 = [envelope(proj3, { created: BASE_TIME + 2000 }), envelope(proj1, { created: BASE_TIME }), envelope(proj2, { created: BASE_TIME + 1000 })];
    const order2 = [envelope(proj2, { created: BASE_TIME + 1000 }), envelope(proj3, { created: BASE_TIME + 2000 }), envelope(proj1, { created: BASE_TIME })];

    const r1 = reduceProjectSnapshots('proj00001', order1);
    const r2 = reduceProjectSnapshots('proj00001', order2);

    expect(r1.project!.status).toBe(r2.project!.status);
    expect(r1.project!.canonicalOwnerWallet).toBe(r2.project!.canonicalOwnerWallet);
    expect(r1.rejectedCount).toBe(r2.rejectedCount);
  });

  it('diagnostic order is stable across permutations', () => {
    const proj1 = validProject({ entityId: 'proj00001', status: 'planned', createdAt: BASE_TIME });
    const proj2 = validProject({ entityId: 'proj00001', status: 'active', createdAt: BASE_TIME });

    const r1 = reduceProjectSnapshots('proj00001', [envelope(proj1, { created: BASE_TIME }), envelope(proj2, { created: BASE_TIME + 1000 })]);
    const r2 = reduceProjectSnapshots('proj00001', [envelope(proj2, { created: BASE_TIME + 1000 }), envelope(proj1, { created: BASE_TIME })]);

    expect(r1.diagnostics).toEqual(r2.diagnostics);
    expect(r1.project!.status).toBe(r2.project!.status);
  });
});
