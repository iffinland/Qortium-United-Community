// ===== Poll Current-Snapshot Reduction =====
//
// QDN overwrites a coordinate in place: after a close, only the closed payload
// remains discoverable at that service/name/identifier. There is no retained
// version history to reduce. The authoritative model therefore treats the
// current discoverable snapshot as independently valid, and the canonical
// owner is the publisher of that snapshot.
//
// Lifecycle transition ordering (false -> true close, no reopen) is enforced by
// the write path and cannot be reconstructed from a single overwritten
// coordinate; we deliberately do not model history that QDN does not expose.

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpPoll } from '../schemas/pollSchema';
import { selectLatestVersion } from '../ordering/authoritativeEntityOrdering';
import type { QdnDiagnostic } from '../diagnostics';

// ---- Result Types ----

export interface ReducedPoll {
  /** The canonical poll snapshot (current discoverable payload). */
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

// ---- Implementation ----

export function reducePollSnapshots(
  entityId: string,
  acceptedSnapshots: QdnResourceEnvelope<QucpPoll>[],
): PollReductionResult {
  if (acceptedSnapshots.length === 0) {
    return { poll: null, diagnostics: [], rejectedCount: 0 };
  }

  // QDN exposes the current resource for a coordinate, not a retained
  // sequence. Select the latest accepted payload deterministically (this is a
  // no-op in the single-coordinate production path) and accept it on its own.
  const canonical =
    selectLatestVersion(acceptedSnapshots) ?? acceptedSnapshots[0];

  const canonicalOwnerWallet =
    canonical.resolvedPublisherAddress ??
    ((canonical.data as Record<string, unknown>).ownerAddress as string | undefined) ??
    '';
  const canonicalOwnerName = canonical.metadata.name;

  return {
    poll: {
      snapshot: canonical,
      isClosed: canonical.data.isClosed === true,
      canonicalOwnerWallet,
      canonicalOwnerName,
      entityId,
    },
    diagnostics: [],
    rejectedCount: 0,
  };
}
