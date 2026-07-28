// ===== Project Immutable Snapshot Reduction =====
//
// Processes accepted project snapshots for one entity:
//   1. Select canonical owner (first accepted wallet by trusted QDN timestamp)
//   2. Reject cross-wallet snapshots
//   3. Apply approved lifecycle transitions (archived is terminal)
//   4. Reject immutable field changes
//   5. Reject forbidden lifecycle transitions (planned→completed, backward, etc.)
//   6. Latest valid snapshot is canonical; history preserved for audit

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpProject, ProjectStatus } from '../schemas/projectSchema';
import { PROJECT_IMMUTABLE_FIELDS, isApprovedLifecycleTransition } from '../schemas/projectSchema';
import { warningDiag, type QdnDiagnostic } from '../diagnostics';

// ---- Result Types ----

export interface ReducedProject {
  /** Latest valid canonical project snapshot. */
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

// ---- Helpers ----

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function immutableFieldsChanged(
  original: QucpProject,
  update: QucpProject,
): string[] {
  const changed: string[] = [];
  for (const field of PROJECT_IMMUTABLE_FIELDS) {
    if (!deepEqual((original as Record<string, unknown>)[field], (update as Record<string, unknown>)[field])) {
      changed.push(field);
    }
  }
  return changed;
}

// ---- Reducer ----

export function reduceProjectSnapshots(
  entityId: string,
  acceptedSnapshots: QdnResourceEnvelope<QucpProject>[],
): ProjectReductionResult {
  const diagnostics: QdnDiagnostic[] = [];
  let rejectedCount = 0;

  if (acceptedSnapshots.length === 0) {
    return { project: null, diagnostics, rejectedCount };
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
      diagnostics.push(warningDiag('project-cross-wallet-update',
        `Cross-wallet project snapshot from ${s.metadata.name} rejected for project ${entityId}`,
        { identifier: s.metadata.identifier }));
      return false;
    }
    return true;
  });

  if (ownerSnapshots.length === 0) {
    return { project: null, diagnostics, rejectedCount };
  }

  // Track latest valid snapshot, applying lifecycle transitions
  let currentSnapshot = ownerSnapshots[0];
  let currentStatus = currentSnapshot.data.status;

  // Valid initial statuses: planned, active
  const VALID_INITIAL: ProjectStatus[] = ['planned', 'active'];
  if (!VALID_INITIAL.includes(currentStatus)) {
    diagnostics.push(warningDiag('project-invalid-initial-status',
      `Initial project status must be planned or active, got ${currentStatus} for ${entityId}`,
      { identifier: currentSnapshot.metadata.identifier }));
    return { project: null, diagnostics, rejectedCount };
  }

  for (let i = 1; i < ownerSnapshots.length; i++) {
    const next = ownerSnapshots[i];
    const nextStatus = next.data.status as ProjectStatus;

    // Check immutable fields
    const changedImmutable = immutableFieldsChanged(currentSnapshot.data, next.data);
    if (changedImmutable.length > 0) {
      rejectedCount++;
      diagnostics.push(warningDiag('project-immutable-fields-changed',
        `Immutable fields changed for project ${entityId}: ${changedImmutable.join(', ')}`,
        { identifier: next.metadata.identifier }));
      continue;
    }

    // Check lifecycle: use approved transition matrix
    if (!isApprovedLifecycleTransition(currentStatus, nextStatus)) {
      rejectedCount++;
      diagnostics.push(warningDiag('project-invalid-status-transition',
        `Invalid lifecycle transition ${currentStatus}→${nextStatus} for project ${entityId}`,
        { identifier: next.metadata.identifier }));
      continue;
    }

    // Archived is terminal: reject any snapshot after archived
    if (currentStatus === 'archived') {
      rejectedCount++;
      diagnostics.push(warningDiag('project-invalid-status-transition',
        `Archived project ${entityId} is terminal; cannot accept further snapshots`,
        { identifier: next.metadata.identifier }));
      continue;
    }

    // Accept this snapshot
    currentSnapshot = next;
    currentStatus = nextStatus;
  }

  return {
    project: {
      snapshot: currentSnapshot,
      status: currentStatus,
      canonicalOwnerWallet: canonicalWallet,
      canonicalOwnerName: canonicalName,
      entityId,
    },
    diagnostics: sortProjectDiagnostics(diagnostics),
    rejectedCount,
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
