// ===== Registry Lineage Validator =====
//
// Pure validation of snapshot lineage (previousSnapshotId chain).
// Does not perform network calls — operates on already-loaded accepted snapshots.

import type { QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';

// ---- Lineage Status ----

export type LineageStatus =
  | 'valid-genesis'
  | 'valid-successor'
  | 'missing-previous'
  | 'self-cycle'
  | 'lineage-cycle'
  | 'fork'
  | 'foreign-or-rejected-previous';

export interface LineageResult {
  status: LineageStatus;
  reason?: string;
}

// ---- Snapshot Map ----

export interface SnapshotEntry {
  snapshot: QucpRoleRegistrySnapshot;
  identifier: string;
}

// ---- Canonical Lineage Validation ----

/**
 * Failure modes for the single canonical role-lineage validator.
 *
 * A valid canonical lineage must have exactly one genesis, every successor must
 * reference an existing predecessor, and there must be no cycles, forks, or
 * ambiguous heads. Discovery completeness/unavailability is handled by the
 * caller because the validator operates on already-loaded snapshots.
 */
export type RoleLineageRejection =
  | 'empty'
  | 'multiple-genesis'
  | 'missing-previous'
  | 'cycle'
  | 'fork'
  | 'ambiguous-head';

export type RoleLineageValidation =
  | { valid: true; head: string }
  | { valid: false; reason: RoleLineageRejection; detail?: string };

/**
 * Validate a complete set of accepted role snapshots as one canonical lineage.
 *
 * This is the single authority-critical lineage interpretation. It does not
 * select the deepest/newest root, treat a missing predecessor as a genesis, or
 * tolerate competing children. It either returns the one unambiguous current
 * head or fails closed with a specific reason.
 */
export function validateRoleLineage(
  snapshotMap: ReadonlyMap<string, SnapshotEntry>,
): RoleLineageValidation {
  if (snapshotMap.size === 0) {
    return { valid: false, reason: 'empty', detail: 'No role snapshots loaded' };
  }

  const genesisIds: string[] = [];
  const childrenByParent = new Map<string, string[]>();

  // 1. Classify genesis snapshots and verify every predecessor exists.
  for (const [id, entry] of snapshotMap) {
    const prev = entry.snapshot.previousSnapshotId;
    if (!prev) {
      genesisIds.push(id);
      continue;
    }
    if (prev === id) {
      return { valid: false, reason: 'cycle', detail: `Snapshot ${id} references itself` };
    }
    if (!snapshotMap.has(prev)) {
      return {
        valid: false,
        reason: 'missing-previous',
        detail: `Snapshot ${id} references missing predecessor ${prev}`,
      };
    }
    const kids = childrenByParent.get(prev) ?? [];
    kids.push(id);
    childrenByParent.set(prev, kids);
  }

  // 2. Exactly one genesis.
  if (genesisIds.length === 0) {
    return {
      valid: false,
      reason: 'cycle',
      detail: 'No genesis snapshot found — the lineage forms a closed cycle',
    };
  }
  if (genesisIds.length > 1) {
    return {
      valid: false,
      reason: 'multiple-genesis',
      detail: `Multiple genesis snapshots: ${genesisIds.join(', ')}`,
    };
  }

  // 3. No forks (multiple children of one parent).
  const forkParents = [...childrenByParent.entries()]
    .filter(([, kids]) => kids.length > 1)
    .map(([parent]) => parent);
  if (forkParents.length > 0) {
    return {
      valid: false,
      reason: 'fork',
      detail: `Forked lineage at parent(s): ${forkParents.join(', ')}`,
    };
  }

  // 4. Walk the single chain from the genesis to find the unambiguous head.
  const genesis = genesisIds[0];
  const visited = new Set<string>();
  let current: string | undefined = genesis;

  while (current) {
    if (visited.has(current)) {
      return { valid: false, reason: 'cycle', detail: `Cycle detected at snapshot ${current}` };
    }
    visited.add(current);
    const kids = childrenByParent.get(current);
    if (!kids || kids.length === 0) {
      break;
    }
    current = kids[0];
  }

  // 5. Every snapshot must be reachable from the single genesis.
  if (visited.size !== snapshotMap.size) {
    return {
      valid: false,
      reason: 'cycle',
      detail: 'Unreachable snapshots indicate a disconnected cycle',
    };
  }

  // 6. Resolve the single current head.
  if (!current) {
    return { valid: false, reason: 'ambiguous-head', detail: 'Could not resolve a single current head' };
  }

  return { valid: true, head: current };
}

/**
 * Validate a loaded role lineage against the query discovery status.
 *
 * A complete discovery with zero snapshots (`empty`) is a valid vacuous
 * lineage: there are no snapshots to compare, so no competing authority can be
 * derived from it. Incomplete/unavailable discovery with zero snapshots remains
 * fail-closed because the caller must not trust a missing registry.
 */
export function validateRoleLineageFromQuery(
  snapshotMap: ReadonlyMap<string, SnapshotEntry>,
  queryStatus: 'complete' | 'incomplete' | 'unavailable' | 'empty',
): RoleLineageValidation {
  if (snapshotMap.size === 0) {
    if (queryStatus === 'empty') {
      return { valid: true, head: '' };
    }
    return { valid: false, reason: 'empty', detail: 'No role snapshots loaded' };
  }
  return validateRoleLineage(snapshotMap);
}

/**
 * Render a canonical lineage validation as a stable human-readable status.
 * Used for diagnostics in authorization rejection details.
 */
export function describeRoleLineage(validation: RoleLineageValidation): string {
  if (validation.valid) {
    return `Valid role lineage with current head ${validation.head}`;
  }
  return validation.detail ?? `Role lineage invalid: ${validation.reason}`;
}

/**
 * Validate the lineage of a snapshot within a set of loaded accepted snapshots.
 *
 * This is a low-level per-snapshot primitive. Authority-critical code must use
 * `validateRoleLineage` for the complete, canonical set validation.
 *
 * @param snapshotId - The ID of the snapshot to validate
 * @param identifier - The QDN identifier of the snapshot
 * @param snapshotMap - Map of snapshotId → { snapshot, identifier } for all loaded accepted snapshots
 */
export function validateSnapshotLineage(
  snapshotId: string,
  _identifier: string,
  snapshotMap: ReadonlyMap<string, SnapshotEntry>,
): LineageResult {
  const entry = snapshotMap.get(snapshotId);
  if (!entry) {
    return { status: 'missing-previous', reason: `Snapshot ${snapshotId} not in loaded set` };
  }

  const snapshot = entry.snapshot;

  // Genesis — no previous
  if (!snapshot.previousSnapshotId) {
    return { status: 'valid-genesis' };
  }

  // Self-cycle check
  if (snapshot.previousSnapshotId === snapshotId) {
    return { status: 'self-cycle', reason: 'Snapshot references itself' };
  }

  // Check previous exists in loaded snapshots
  const prevEntry = snapshotMap.get(snapshot.previousSnapshotId);

  if (!prevEntry) {
    // Previous not loaded — may be foreign or not yet fetched
    return {
      status: 'missing-previous',
      reason: `Previous snapshot ${snapshot.previousSnapshotId} not found in loaded accepted snapshots`,
    };
  }

  // Cycle detection: walk the chain
  const visited = new Set<string>();
  let current: string | undefined = snapshotId;

  while (current) {
    if (visited.has(current)) {
      return { status: 'lineage-cycle', reason: `Cycle detected at snapshot ${current}` };
    }
    visited.add(current);
    const curEntry = snapshotMap.get(current);
    current = curEntry?.snapshot.previousSnapshotId;
  }

  return { status: 'valid-successor' };
}

/**
 * Detect forks in a set of loaded accepted snapshots.
 *
 * A fork exists when multiple snapshots reference the same previousSnapshotId.
 * This is a low-level primitive. Authority-critical code must use
 * `validateRoleLineage`, which composes fork detection with genesis, orphan,
 * cycle, and head-uniqueness checks.
 */
export function detectForks(
  snapshotMap: ReadonlyMap<string, SnapshotEntry>,
): Map<string, string[]> {
  const previousToChildren = new Map<string, string[]>();

  for (const [id, entry] of snapshotMap) {
    const prev = entry.snapshot.previousSnapshotId;
    if (prev) {
      const children = previousToChildren.get(prev) ?? [];
      children.push(id);
      previousToChildren.set(prev, children);
    }
  }

  // Only return parents with multiple children (forks)
  const forks = new Map<string, string[]>();
  for (const [prev, children] of previousToChildren) {
    if (children.length > 1) {
      forks.set(prev, children);
    }
  }

  return forks;
}
