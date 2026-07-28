// ===== Snapshot Registry Selection and Last-Known-Good =====
//
// Deterministic selection of the current authoritative role snapshot
// from accepted QDN envelopes, with lineage and fork detection.

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';
import { compareByQdnMetadata } from '../ordering/authoritativeEntityOrdering';
import { detectForks, findLineageHead } from './registryLineage';

// ---- Accepted Snapshot Wrapper ----

export interface AcceptedSnapshot {
  envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>;
  acceptedAt: number;
}

// ---- Selection Result ----

export type SnapshotSelection =
  | {
      status: 'available';
      snapshot: AcceptedSnapshot;
      source: 'current';
    }
  | {
      status: 'last-known-good';
      snapshot: AcceptedSnapshot;
      reason: string;
    }
  | {
      status: 'unavailable';
      reason: string;
    }
  | {
      status: 'history-unresolved';
      reason: string;
    };

// ---- Deterministic Selection ----

/**
 * Select the current authoritative role snapshot from accepted envelopes.
 *
 * Only accepted (pipeline-validated) snapshots are considered.
 * The pipeline already ensures only SysOp-published snapshots are accepted.
 *
 * Ordering uses trusted QDN metadata, not payload timestamps.
 * Forked history produces 'history-unresolved'.
 */
export function selectCurrentSnapshot(
  acceptedEnvelopes: QdnResourceEnvelope<QucpRoleRegistrySnapshot>[],
): SnapshotSelection {
  if (acceptedEnvelopes.length === 0) {
    return { status: 'unavailable', reason: 'No accepted role snapshots found' };
  }

  // Sort by QDN metadata: newest first
  const sorted = [...acceptedEnvelopes].sort((a, b) => compareByQdnMetadata(a, b));
  const sortedIds = sorted.map((e) => e.data.snapshotId);

  // Build snapshot map
  const snapshotMap = new Map<string, { snapshot: QucpRoleRegistrySnapshot; identifier: string }>();
  for (const env of acceptedEnvelopes) {
    snapshotMap.set(env.data.snapshotId, {
      snapshot: env.data,
      identifier: env.metadata.identifier,
    });
  }

  // Check for forks
  const forks = detectForks(snapshotMap);
  if (forks.size > 0) {
    const forkParents = [...forks.keys()].join(', ');
    return {
      status: 'history-unresolved',
      reason: `Forked snapshot history detected at parent(s): ${forkParents}`,
    };
  }

  // Find the latest lineage head
  const head = findLineageHead(snapshotMap, sortedIds);

  if (!head) {
    return {
      status: 'history-unresolved',
      reason: 'No valid lineage head found — missing genesis or cycle detected',
    };
  }

  // Find the envelope for the head
  const headEnv = acceptedEnvelopes.find((e) => e.data.snapshotId === head);
  if (!headEnv) {
    return { status: 'unavailable', reason: 'Lineage head envelope not found' };
  }

  const snapshot: AcceptedSnapshot = {
    envelope: headEnv,
    acceptedAt: Date.now(),
  };

  return { status: 'available', snapshot, source: 'current' };
}

// ---- Last-Known-Good Cache ----

interface LkgCacheEntry {
  snapshot: AcceptedSnapshot;
  cachedAt: number;
}

let lkgCache: LkgCacheEntry | null = null;

export function getLastKnownGoodSnapshot(): AcceptedSnapshot | null {
  if (!lkgCache) return null;
  return lkgCache.snapshot;
}

export function storeLastKnownGoodSnapshot(snapshot: AcceptedSnapshot): void {
  lkgCache = { snapshot, cachedAt: Date.now() };
}

export function clearLastKnownGoodSnapshot(): void {
  lkgCache = null;
}

export function hasLastKnownGoodSnapshot(): boolean {
  return lkgCache !== null;
}

// ---- Combined Selection with LKG Fallback ----

export function selectSnapshotWithLkg(
  acceptedEnvelopes: QdnResourceEnvelope<QucpRoleRegistrySnapshot>[],
): SnapshotSelection {
  const primary = selectCurrentSnapshot(acceptedEnvelopes);

  if (primary.status === 'available') {
    storeLastKnownGoodSnapshot(primary.snapshot);
    return primary;
  }

  // For 'unavailable' or 'history-unresolved', try LKG
  const lkg = getLastKnownGoodSnapshot();
  if (lkg) {
    return {
      status: 'last-known-good',
      snapshot: lkg,
      reason: primary.status === 'unavailable' ? primary.reason : `${primary.reason}. Using cached snapshot.`,
    };
  }

  return primary;
}

// ---- Re-export for backward compatibility during transition ----
// (Will be removed after all consumers migrate)
export type RegistrySelection = SnapshotSelection;
