// ===== Poll Immutable Snapshot Reduction =====
//
// Processes accepted poll snapshots for one entity:
//   1. Select canonical owner (first accepted wallet)
//   2. Earliest valid initial snapshot (isClosed must be false)
//   3. Later same-owner snapshots: only false→true closure allowed
//   4. Cross-wallet and field-changing snapshots rejected
//   5. Reopening (true→false) rejected
//   6. Last valid snapshot preserved if later invalid snapshot exists

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpPoll } from '../schemas/pollSchema';
import { POLL_IMMUTABLE_FIELDS } from '../schemas/pollSchema';
import { warningDiag, type QdnDiagnostic } from '../diagnostics';

// ---- Result Types ----

export interface ReducedPoll {
  /** The canonical poll snapshot (latest valid). */
  snapshot: QdnResourceEnvelope<QucpPoll>;
  /** Whether the poll is closed. */
  isClosed: boolean;
  /** Canonical owner wallet. */
  canonicalOwnerWallet: string;
  /** Canonical owner name. */
  canonicalOwnerName: string;
  /** Poll entity ID. */
  entityId: string;
}

export interface PollReductionResult {
  poll: ReducedPoll | null;
  diagnostics: QdnDiagnostic[];
  rejectedCount: number;
}

// ---- Implementations ----

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function immutableFieldsChanged(
  original: QucpPoll,
  update: QucpPoll,
): string[] {
  const changed: string[] = [];
  for (const field of POLL_IMMUTABLE_FIELDS) {
    if (!deepEqual((original as Record<string, unknown>)[field], (update as Record<string, unknown>)[field])) {
      changed.push(field);
    }
  }
  return changed;
}

export function reducePollSnapshots(
  entityId: string,
  acceptedSnapshots: QdnResourceEnvelope<QucpPoll>[],
): PollReductionResult {
  const diagnostics: QdnDiagnostic[] = [];
  let rejectedCount = 0;

  if (acceptedSnapshots.length === 0) {
    return { poll: null, diagnostics, rejectedCount };
  }

  // Sort by QDN metadata (earliest first for canonical owner selection)
  const sorted = [...acceptedSnapshots].sort((a, b) =>
    (a.metadata.created ?? 0) - (b.metadata.created ?? 0),
  );

  // Canonical owner = wallet of the first (earliest) accepted publisher
  const canonicalWallet = sorted[0].resolvedPublisherAddress ??
    (sorted[0].data as Record<string, unknown>).ownerAddress as string;
  const canonicalName = sorted[0].metadata.name;

  // Filter to canonical owner only; reject cross-wallet
  const ownerSnapshots = sorted.filter((s) => {
    const wallet = s.resolvedPublisherAddress ?? (s.data as Record<string, unknown>).ownerAddress as string;
    if (wallet !== canonicalWallet) {
      rejectedCount++;
      diagnostics.push(warningDiag('poll-cross-wallet-update',
        `Cross-wallet poll snapshot from ${s.metadata.name} rejected for poll ${entityId}`,
        { identifier: s.metadata.identifier }));
      return false;
    }
    return true;
  });

  // Find the first valid initial snapshot (isClosed must be false)
  let initialSnapshot: QdnResourceEnvelope<QucpPoll> | null = null;
  for (const snap of ownerSnapshots) {
    if (snap.data.isClosed === false) {
      initialSnapshot = snap;
      break;
    }
    rejectedCount++;
    diagnostics.push(warningDiag('poll-invalid-initial',
      `Initial poll snapshot must have isClosed=false, got true for ${entityId}`,
      { identifier: snap.metadata.identifier }));
  }

  if (!initialSnapshot) {
    return { poll: null, diagnostics, rejectedCount };
  }

  // Process later snapshots: only allow false→true closure
  let currentBest: QdnResourceEnvelope<QucpPoll> = initialSnapshot;
  let currentClosed = false;
  const laterSnapshots = ownerSnapshots.filter(
    (s) => (s.metadata.created ?? 0) > (initialSnapshot!.metadata.created ?? 0),
  );

  // Sort later snapshots by QDN time ascending for sequential processing
  const laterSorted = [...laterSnapshots].sort((a, b) =>
    (a.metadata.created ?? 0) - (b.metadata.created ?? 0),
  );

  for (const snap of laterSorted) {
    // Check immutable fields
    const changed = immutableFieldsChanged(currentBest.data, snap.data);
    // Remove isClosed from the check — it's the ONLY mutable field
    const nonClosureChanges = changed.filter((f) => f !== 'isClosed');

    if (nonClosureChanges.length > 0) {
      rejectedCount++;
      diagnostics.push(warningDiag('poll-immutable-field-changed',
        `Immutable fields changed in poll ${entityId}: ${nonClosureChanges.join(', ')}`,
        { identifier: snap.metadata.identifier }));
      continue;
    }

    // Only valid transition: false → true
    if (currentClosed && snap.data.isClosed === false) {
      rejectedCount++;
      diagnostics.push(warningDiag('poll-reopen-rejected',
        `Poll ${entityId} cannot be reopened`,
        { identifier: snap.metadata.identifier }));
      continue;
    }

    if (!currentClosed && snap.data.isClosed === true) {
      // Valid close
      currentClosed = true;
      currentBest = snap;
    } else if (currentClosed && snap.data.isClosed === true) {
      // Already closed, but this is a valid update (no field changes)
      currentBest = snap;
    }
  }

  return {
    poll: {
      snapshot: currentBest,
      isClosed: currentClosed,
      canonicalOwnerWallet: canonicalWallet,
      canonicalOwnerName: canonicalName,
      entityId,
    },
    diagnostics,
    rejectedCount,
  };
}
