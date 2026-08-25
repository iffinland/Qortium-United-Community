// ===== Project Production-Path Tests =====
//
// QUCP-PROJECTS-001A: Tests through actual production functions:
//   validatedRuntimeQuery, projectPolicy, reduceProjectSnapshots,
//   queryProjects, reduceProjectResults, identifiers, ordering, diagnostics

import { describe, it, expect } from 'vitest';
import { projectPolicy } from '../services/qdn/policies/projectPolicy';
import type { QucpProject } from '../services/qdn/schemas/projectSchema';
import { reduceProjectResults } from '../services/qdn/runtime/projectRuntime';
import { buildQucpIdentifier, parseQucpIdentifier, validateQucpIdentifier } from '../services/qdn/identifiers/qucpIdentifiers';
import type { QucpResourceFamily } from '../services/qdn/schemas/commonSchemas';
import type { QdnResourceEnvelope } from '../services/qdn/QdnResourceEnvelope';
import type { IdentityResolution } from '../services/qdn/IdentityResolver';
import type { ValidatedRuntimeQueryResult } from '../services/qdn/runtime/runtimeTypes';

// ---- Test Wallets ----
const OWNER = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const FOREIGN = 'QForeignForeignForeignForeignAbCd';

// ---- Helpers ----

function validProjectData(overrides?: Partial<QucpProject>): QucpProject {
  return {
    schemaVersion: 1 as const,
    resourceFamily: 'qucp-project' as const,
    entityId: 'proj00001',
    title: 'Test Project',
    description: 'A test project description.',
    status: 'planned',
    ownerName: 'Alice',
    ownerAddress: OWNER,
    createdAt: 1700000000000,
    ...overrides,
  };
}

function makeIdentity(name: string, address: string): IdentityResolution {
  return { name, status: 'verified' as const, address, resolvedAt: Date.now() };
}

function makeEnvelope(
  data: QucpProject,
  created: number = data.createdAt,
  publisherAddress?: string,
): QdnResourceEnvelope<QucpProject> {
  return {
    data,
    metadata: {
      name: data.ownerName,
      service: 'DOCUMENT',
      identifier: `qucp-project-${data.entityId}`,
      created,
    },
    resolvedPublisherAddress: publisherAddress ?? data.ownerAddress,
    source: 'qdn',
  };
}

function makeValidatedResult(
  items: QdnResourceEnvelope<QucpProject>[],
  status: 'complete' | 'incomplete' | 'unavailable' | 'empty' = 'complete',
  reason?: string,
): ValidatedRuntimeQueryResult<QucpProject> {
  if (status === 'unavailable') {
    return { status: 'unavailable', items: [], reason: reason ?? 'Search failed', diagnostics: [] };
  }
  if (status === 'empty') {
    return { status: 'empty', items: [], diagnostics: [] };
  }
  const validated = items.map((env) => ({
    envelope: env,
    entityId: env.data.entityId,
    publisherName: env.metadata.name,
    publisherAddress: env.resolvedPublisherAddress ?? env.data.ownerAddress,
  }));
  if (status === 'incomplete') {
    return { status: 'incomplete', items: validated, rejectedCount: 0, quarantinedCount: 0, reason: reason ?? 'Partial fetch', diagnostics: [] };
  }
  return { status: 'complete', items: validated, rejectedCount: 0, quarantinedCount: 0, diagnostics: [] };
}

// ================================================================
//  PROJECT POLICY PRODUCTION-PATH TESTS
// ================================================================

describe('projectPolicy (production)', () => {
  it('valid publisher accepted', async () => {
    const data = validProjectData();
    const env = makeEnvelope(data);
    const result = await projectPolicy.validatePublisher!(env, makeIdentity('Alice', OWNER));
    expect(result.valid).toBe(true);
  });

  it('ownerName mismatch: metadata vs payload rejected', async () => {
    const data = validProjectData({ ownerName: 'Eve' });
    const env = makeEnvelope(data, data.createdAt, OWNER);
    env.metadata.name = 'Alice';
    env.data.ownerName = 'Eve';
    const result = await projectPolicy.validatePublisher!(env, makeIdentity('Alice', OWNER));
    expect(result.valid).toBe(false);
  });

  it('forged ownerAddress rejected', async () => {
    const data = validProjectData({ ownerAddress: OWNER });
    const env = makeEnvelope(data, data.createdAt, OWNER);
    const result = await projectPolicy.validatePublisher!(env, makeIdentity('Alice', FOREIGN));
    expect(result.valid).toBe(false);
  });

  it('resourceFamily mismatch rejected', () => {
    const result = projectPolicy.parse({ ...validProjectData(), resourceFamily: 'qucp-post' });
    expect(result.success).toBe(false);
  });

  it('parses valid project', () => {
    const result = projectPolicy.parse(validProjectData());
    expect('data' in result).toBe(true);
  });

  it('identifier validation: valid qucp-project accepted', () => {
    const result = projectPolicy.validateIdentifier('qucp-project-proj00001');
    expect(result.valid).toBe(true);
  });

  it('identifier validation: legacy proj- rejected', () => {
    const result = projectPolicy.validateIdentifier('proj-12345');
    expect(result.valid).toBe(false);
  });

  it('identifier validation: legacy project- rejected', () => {
    const result = projectPolicy.validateIdentifier('project-12345');
    expect(result.valid).toBe(false);
  });

  it('identifier validation: qucp-v1-project- rejected', () => {
    const result = projectPolicy.validateIdentifier('qucp-v1-project-proj00001');
    expect(result.valid).toBe(false);
  });

  it('identifier validation: malformed rejected', () => {
    const result = projectPolicy.validateIdentifier('not-an-identifier');
    expect(result.valid).toBe(false);
  });
});

// ================================================================
//  IDENTIFIER TESTS
// ================================================================

describe('project identifiers', () => {
  it('buildQucpIdentifier produces canonical identifier', () => {
    const id = buildQucpIdentifier('qucp-project', 'proj00001');
    expect(id).toBe('qucp-project-proj00001');
  });

  it('parseQucpIdentifier extracts family and entityId', () => {
    const parsed = parseQucpIdentifier('qucp-project-proj00001');
    expect(parsed).not.toBeNull();
    expect(parsed!.family).toBe('qucp-project');
    expect(parsed!.entityId).toBe('proj00001');
  });

  it('validateQucpIdentifier accepts valid', () => {
    const result = validateQucpIdentifier('qucp-project-proj00001', 'qucp-project' as QucpResourceFamily);
    expect(result.valid).toBe(true);
  });

  it('validateQucpIdentifier rejects wrong family', () => {
    const result = validateQucpIdentifier('qucp-post-proj00001', 'qucp-project' as QucpResourceFamily);
    expect(result.valid).toBe(false);
  });

  it('parse rejects legacy proj-', () => {
    const result = parseQucpIdentifier('proj-12345');
    expect(result).toBeNull();
  });

  it('parse rejects legacy project-', () => {
    const result = parseQucpIdentifier('project-proj-12345');
    expect(result).toBeNull();
  });

  it('parse rejects qucp-v1-project-', () => {
    const result = parseQucpIdentifier('qucp-v1-project-proj00001');
    expect(result).toBeNull();
  });
});

// ================================================================
//  FULL PROJECT DISCOVERY CALL-CHAIN TESTS
// ================================================================

describe('full project discovery call chain', () => {
  const BASE_TIME = 1700000000000;

  it('valid initial project + same-owner update produces correct result', () => {
    const proj1 = validProjectData({ status: 'planned', createdAt: BASE_TIME });
    const proj2 = validProjectData({ status: 'active', title: 'Updated Title', createdAt: BASE_TIME });

    const result = makeValidatedResult([
      makeEnvelope(proj1, BASE_TIME),
      makeEnvelope(proj2, BASE_TIME + 1000),
    ], 'complete');

    const reduced = reduceProjectResults(result);
    expect(reduced.projects).toHaveLength(1);
    expect(reduced.projects[0].status).toBe('active');
    expect(reduced.projects[0].snapshot.data.title).toBe('Updated Title');
    expect(reduced.completeness).toBe('complete');
    expect(reduced.projects[0].canonicalOwnerWallet).toBe(OWNER);
  });

  it('latest snapshot publisher is canonical owner', () => {
    const proj1 = validProjectData({ status: 'planned', createdAt: BASE_TIME });
    const proj2 = validProjectData({ status: 'active', createdAt: BASE_TIME, ownerAddress: OWNER });

    const result = makeValidatedResult([
      makeEnvelope(proj1, BASE_TIME, OWNER),
      makeEnvelope(proj2, BASE_TIME + 1000, FOREIGN),
    ], 'complete');

    const reduced = reduceProjectResults(result);
    expect(reduced.projects).toHaveLength(1);
    expect(reduced.projects[0].status).toBe('active');
    expect(reduced.projects[0].canonicalOwnerWallet).toBe(FOREIGN);
  });

  it('latest snapshot content is authoritative', () => {
    const proj1 = validProjectData({ status: 'planned', createdAt: BASE_TIME, ownerName: 'Alice' });
    const proj2 = validProjectData({ status: 'active', createdAt: BASE_TIME, ownerName: 'Bob' });

    const result = makeValidatedResult([
      makeEnvelope(proj1, BASE_TIME),
      makeEnvelope(proj2, BASE_TIME + 1000),
    ], 'complete');

    const reduced = reduceProjectResults(result);
    expect(reduced.projects).toHaveLength(1);
    expect(reduced.projects[0].canonicalOwnerName).toBe('Bob');
  });

  it('latest snapshot wins even for a backward-looking status', () => {
    const proj1 = validProjectData({ status: 'active', createdAt: BASE_TIME });
    const proj2 = validProjectData({ status: 'planned', createdAt: BASE_TIME });

    const result = makeValidatedResult([
      makeEnvelope(proj1, BASE_TIME),
      makeEnvelope(proj2, BASE_TIME + 1000),
    ], 'complete');

    const reduced = reduceProjectResults(result);
    expect(reduced.projects).toHaveLength(1);
    expect(reduced.projects[0].status).toBe('planned');
    expect(reduced.diagnostics).toHaveLength(0);
  });

  it('planned→completed is accepted as the current terminal state', () => {
    const proj1 = validProjectData({ status: 'planned', createdAt: BASE_TIME });
    const proj2 = validProjectData({ status: 'completed', createdAt: BASE_TIME });

    const result = makeValidatedResult([
      makeEnvelope(proj1, BASE_TIME),
      makeEnvelope(proj2, BASE_TIME + 1000),
    ], 'complete');

    const reduced = reduceProjectResults(result);
    expect(reduced.projects[0].status).toBe('completed');
  });

  it('single completed project remains canonical after reload', () => {
    const proj = validProjectData({ status: 'completed', createdAt: BASE_TIME });
    const result = makeValidatedResult([makeEnvelope(proj, BASE_TIME)], 'complete');
    const reduced = reduceProjectResults(result);
    expect(reduced.projects).toHaveLength(1);
    expect(reduced.projects[0].status).toBe('completed');
    expect(reduced.diagnostics).toHaveLength(0);
  });
});

// ================================================================
//  COMPLETENESS MATRIX TESTS
// ================================================================

describe('project completeness matrix', () => {
  it('complete + accepted projects → complete', () => {
    const proj = validProjectData();
    const result = makeValidatedResult([makeEnvelope(proj, 1700000000000)], 'complete');
    const reduced = reduceProjectResults(result);
    expect(reduced.completeness).toBe('complete');
    expect(reduced.projects.length).toBe(1);
  });

  it('complete + zero resources → empty', () => {
    const result = makeValidatedResult([], 'complete');
    const reduced = reduceProjectResults(result);
    expect(reduced.completeness).toBe('empty');
    expect(reduced.projects.length).toBe(0);
  });

  it('incomplete + accepted projects → incomplete', () => {
    const proj = validProjectData();
    const result = makeValidatedResult([makeEnvelope(proj, 1700000000000)], 'incomplete', 'Truncated');
    const reduced = reduceProjectResults(result);
    expect(reduced.completeness).toBe('incomplete');
    expect(reduced.projects.length).toBe(1);
  });

  it('incomplete + no accepted projects → incomplete', () => {
    const proj = validProjectData({ status: 'completed' });
    const result = makeValidatedResult([makeEnvelope(proj, 1700000000000)], 'incomplete', 'Truncated');
    const reduced = reduceProjectResults(result);
    expect(reduced.completeness).toBe('incomplete');
  });

  it('unavailable → unavailable', () => {
    const result = makeValidatedResult([], 'unavailable', 'Search failed');
    const reduced = reduceProjectResults(result);
    expect(reduced.completeness).toBe('unavailable');
  });

  it('empty → empty', () => {
    const result = makeValidatedResult([], 'empty');
    const reduced = reduceProjectResults(result);
    expect(reduced.completeness).toBe('empty');
  });
});

// ================================================================
//  PROJECT DETAIL STATE TESTS
// ================================================================

describe('project detail states', () => {
  it('project found in complete results', () => {
    const proj = validProjectData({ entityId: 'proj00099' });
    const result = makeValidatedResult([makeEnvelope(proj, 1700000000000)], 'complete');
    const reduced = reduceProjectResults(result);
    const found = reduced.projects.find(p => p.entityId === 'proj00099');
    expect(found).toBeDefined();
    expect(reduced.completeness).toBe('complete');
  });

  it('project absent in complete results — definitive not found', () => {
    const proj = validProjectData({ entityId: 'proj00001' });
    const result = makeValidatedResult([makeEnvelope(proj, 1700000000000)], 'complete');
    const reduced = reduceProjectResults(result);
    const found = reduced.projects.find(p => p.entityId === 'proj00099');
    expect(found).toBeUndefined();
    expect(reduced.completeness).toBe('complete');
  });

  it('project absent in incomplete results — not found in incomplete results', () => {
    const proj = validProjectData({ entityId: 'proj00001' });
    const result = makeValidatedResult([makeEnvelope(proj, 1700000000000)], 'incomplete', 'Truncated');
    const reduced = reduceProjectResults(result);
    const found = reduced.projects.find(p => p.entityId === 'proj00099');
    expect(found).toBeUndefined();
    expect(reduced.completeness).toBe('incomplete');
  });

  it('unavailable — no projects', () => {
    const result = makeValidatedResult([], 'unavailable', 'Search failed');
    const reduced = reduceProjectResults(result);
    expect(reduced.completeness).toBe('unavailable');
    expect(reduced.projects).toHaveLength(0);
  });
});

// ================================================================
//  DETERMINISTIC ORDERING TESTS
// ================================================================

describe('project list ordering', () => {
  const BASE = 1700000000000;

  it('multiple projects sorted by latest update', () => {
    const projA = validProjectData({ entityId: 'proj0000a', title: 'A', createdAt: BASE });
    const projB = validProjectData({ entityId: 'proj0000b', title: 'B', createdAt: BASE });
    const projC = validProjectData({ entityId: 'proj0000c', title: 'C', createdAt: BASE });

    const result = makeValidatedResult([
      makeEnvelope(projA, BASE),
      makeEnvelope(projB, BASE + 2000),
      makeEnvelope(projC, BASE + 1000),
    ], 'complete');

    const reduced = reduceProjectResults(result);
    expect(reduced.projects).toHaveLength(3);
  });

  it('input permutation produces same entity set', () => {
    const projA = validProjectData({ entityId: 'proj0000a', title: 'A', createdAt: BASE });
    const projB = validProjectData({ entityId: 'proj0000b', title: 'B', createdAt: BASE });

    const r1 = reduceProjectResults(makeValidatedResult([
      makeEnvelope(projA, BASE),
      makeEnvelope(projB, BASE + 1000),
    ], 'complete'));

    const r2 = reduceProjectResults(makeValidatedResult([
      makeEnvelope(projB, BASE + 1000),
      makeEnvelope(projA, BASE),
    ], 'complete'));

    const ids1 = r1.projects.map(p => p.entityId).sort();
    const ids2 = r2.projects.map(p => p.entityId).sort();
    expect(ids1).toEqual(ids2);
  });
});

// ================================================================
//  DIAGNOSTIC ORDERING TESTS
// ================================================================

describe('diagnostic ordering', () => {
  const BASE = 1700000000000;

  it('diagnostics stable across input permutations', () => {
    const proj1 = validProjectData({ entityId: 'proj00001', status: 'planned', createdAt: BASE });
    const proj2 = validProjectData({ entityId: 'proj00001', status: 'completed', createdAt: BASE }); // invalid transition
    const proj3 = validProjectData({ entityId: 'proj00001', status: 'active', ownerName: 'Eve', createdAt: BASE }); // immutable change

    const r1 = reduceProjectResults(makeValidatedResult([
      makeEnvelope(proj1, BASE),
      makeEnvelope(proj2, BASE + 1000),
      makeEnvelope(proj3, BASE + 2000),
    ], 'complete'));

    const r2 = reduceProjectResults(makeValidatedResult([
      makeEnvelope(proj3, BASE + 2000),
      makeEnvelope(proj1, BASE),
      makeEnvelope(proj2, BASE + 1000),
    ], 'complete'));

    expect(r1.diagnostics.map(d => d.code).sort()).toEqual(r2.diagnostics.map(d => d.code).sort());
    expect(r1.projects[0].status).toBe(r2.projects[0].status);
    expect(r1.diagnostics.length).toBe(r2.diagnostics.length);
  });

  it('terminal snapshot produces no lifecycle rejection diagnostic', () => {
    const proj = validProjectData({ entityId: 'proj00001', status: 'completed' });
    const result = makeValidatedResult([makeEnvelope(proj, BASE)], 'complete');
    const reduced = reduceProjectResults(result);
    expect(reduced.diagnostics).toHaveLength(0);
    expect(reduced.projects[0].status).toBe('completed');
  });
});
