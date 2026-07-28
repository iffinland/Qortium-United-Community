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

interface SnapshotEntry {
  snapshot: QucpRoleRegistrySnapshot;
  identifier: string;
}

/**
 * Validate the lineage of a snapshot within a set of loaded accepted snapshots.
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

/**
 * Find the latest valid lineage head from loaded accepted snapshots.
 * Returns the snapshot ID at the end of the longest valid chain,
 * or null if no valid genesis exists.
 */
export function findLineageHead(
  snapshotMap: ReadonlyMap<string, SnapshotEntry>,
  sortedByMetadata: string[], // snapshot IDs sorted by QDN metadata (newest first)
): string | null {
  // Build parent→child map for valid snapshots
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const [id, entry] of snapshotMap) {
    const prev = entry.snapshot.previousSnapshotId;
    if (prev && snapshotMap.has(prev) && prev !== id) {
      const list = children.get(prev) ?? [];
      list.push(id);
      children.set(prev, list);
      hasParent.add(id);
    }
  }

  // Find all genesis snapshots (no parent or parent not loaded)
  const roots = [...snapshotMap.keys()].filter((id) => !hasParent.has(id));

  if (roots.length === 0) return null;

  // Walk from each root to find the deepest descendant, preferring QDN metadata order
  let best: string | null = null;
  let bestDepth = -1;

  for (const root of roots) {
    const result = walkChain(root, children, sortedByMetadata, new Set());
    if (result && result.depth > bestDepth) {
      best = result.head;
      bestDepth = result.depth;
    } else if (result && result.depth === bestDepth && best) {
      // Tie-break by QDN metadata order
      const currentIdx = sortedByMetadata.indexOf(result.head);
      const bestIdx = sortedByMetadata.indexOf(best);
      if (currentIdx >= 0 && (bestIdx < 0 || currentIdx < bestIdx)) {
        best = result.head;
      }
    }
  }

  return best;
}

interface WalkResult {
  head: string;
  depth: number;
}

function walkChain(
  nodeId: string,
  children: ReadonlyMap<string, string[]>,
  sortedByMetadata: string[],
  visited: Set<string>,
): WalkResult | null {
  if (visited.has(nodeId)) return null; // cycle
  visited.add(nodeId);

  const kids = children.get(nodeId);
  if (!kids || kids.length === 0) {
    return { head: nodeId, depth: 0 };
  }

  // If fork detected, prefer the child that appears first in QDN metadata order
  let bestKid: string | null = null;
  let bestIdx = Infinity;

  for (const kid of kids) {
    const idx = sortedByMetadata.indexOf(kid);
    if (idx >= 0 && idx < bestIdx) {
      bestIdx = idx;
      bestKid = kid;
    }
  }

  if (!bestKid) {
    return { head: nodeId, depth: 0 };
  }

  const childResult = walkChain(bestKid, children, sortedByMetadata, new Set(visited));
  if (!childResult) return { head: nodeId, depth: 0 };

  return { head: childResult.head, depth: childResult.depth + 1 };
}
