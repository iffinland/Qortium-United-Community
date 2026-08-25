// ===== Project Current-Snapshot Reduction =====
//
// QDN overwrites a coordinate in place: after a terminal update, only the
// terminal payload remains discoverable at that service/name/identifier.
// There is no retained version history to reduce. The authoritative model
// therefore treats the current discoverable snapshot as independently valid,
// and the canonical owner is the publisher of that snapshot.
//
// Lifecycle transition ordering is enforced by the write path and cannot be
// reconstructed from a single overwritten coordinate; we deliberately do not
// model history that QDN does not expose.

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpProject, ProjectStatus } from '../schemas/projectSchema';
import { selectLatestVersion } from '../ordering/authoritativeEntityOrdering';
import type { QdnDiagnostic } from '../diagnostics';

// ---- Result Types ----

export interface ReducedProject {
  /** The current canonical project snapshot (latest discoverable payload). */
  snapshot: QdnResourceEnvelope<QucpProject>;
  /** Current project status. */
  status: ProjectStatus;
  /** Canonical owner wallet. */
  canonicalOwnerWallet: string;
  /** Canonical owner name. */
  canonicalOwnerName: string;
  /** Project entity ID. */
  entityId: string;
}

export interface ProjectReductionResult {
  project: ReducedProject | null;
  diagnostics: QdnDiagnostic[];
  rejectedCount: number;
}

// ---- Reducer ----

export function reduceProjectSnapshots(
  entityId: string,
  acceptedSnapshots: QdnResourceEnvelope<QucpProject>[],
): ProjectReductionResult {
  if (acceptedSnapshots.length === 0) {
    return { project: null, diagnostics: [], rejectedCount: 0 };
  }

  // QDN exposes the current resource for a coordinate, not a retained
  // sequence. Select the latest accepted payload deterministically and accept
  // it on its own, including terminal (completed/archived) statuses.
  const canonical =
    selectLatestVersion(acceptedSnapshots) ?? acceptedSnapshots[0];

  const canonicalOwnerWallet =
    canonical.resolvedPublisherAddress ??
    ((canonical.data as Record<string, unknown>).ownerAddress as string | undefined) ??
    '';
  const canonicalOwnerName = canonical.metadata.name;

  return {
    project: {
      snapshot: canonical,
      status: canonical.data.status,
      canonicalOwnerWallet,
      canonicalOwnerName,
      entityId,
    },
    diagnostics: [],
    rejectedCount: 0,
  };
}

// ---- Diagnostic Sorter ----

/**
 * Sort project diagnostics deterministically by stable keys.
 * Order: code → entityId → identifier → field → message.
 */
export function sortProjectDiagnostics(diags: QdnDiagnostic[]): QdnDiagnostic[] {
  return [...diags].sort((a, b) => {
    const codeCmp = (a.code ?? '').localeCompare(b.code ?? '');
    if (codeCmp !== 0) return codeCmp;
    const recA = a as unknown as Record<string, unknown>;
    const recB = b as unknown as Record<string, unknown>;
    const eidCmp = ((recA.entityId as string) ?? '').localeCompare((recB.entityId as string) ?? '');
    if (eidCmp !== 0) return eidCmp;
    const identCmp = ((recA.identifier as string) ?? '').localeCompare((recB.identifier as string) ?? '');
    if (identCmp !== 0) return identCmp;
    const fieldCmp = ((recA.field as string) ?? '').localeCompare((recB.field as string) ?? '');
    if (fieldCmp !== 0) return fieldCmp;
    return (a.message ?? '').localeCompare(b.message ?? '');
  });
}
