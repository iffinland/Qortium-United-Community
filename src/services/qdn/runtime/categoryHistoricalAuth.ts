// ===== Support Category Historical Authorization =====
//
// Model C: Historical role timeline lookup.
//
// During category discovery, verifies that the publisher had Admin or SysOp
// authority at the time the category was published — using trusted QDN
// metadata timestamps and canonical SysOp-published role snapshots.
//
// Trusted publication time: category envelope metadata.created (QDN Core)
// Trusted snapshot time: role snapshot envelope metadata.created (QDN Core)
//
// Algorithm:
//   1. If publisher is SysOp trust anchor → authorized
//   2. Find latest canonical role snapshot where snapshot.QDN.created <= category.QDN.created
//   3. If no such snapshot → not authorized (role history unavailable)
//   4. Check publisher wallet has 'admin' role in that snapshot
//   5. If yes → authorized; if no → not authorized

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';
import { hasRole } from '../roles/roleAuthorization';
import { QUC_SYSOP_ADDRESS } from '../../../config/qortiumTrust';
import type { QdnDiagnostic } from '../diagnostics';

// ---- Result Types ----

export type HistoricalAuthResult =
  | { authorized: true; source: 'sysop-trust-anchor' | 'admin-at-publication'; snapshotEntityId?: string }
  | { authorized: false; reason: HistoricalAuthRejection; detail?: string; diagnostics?: QdnDiagnostic[] };

export type HistoricalAuthRejection =
  | 'not-admin-nor-sysop-at-publication'
  | 'role-history-unavailable'
  | 'role-history-incomplete'
  | 'role-snapshot-lineage-invalid'
  | 'role-snapshot-not-found-for-time'
  | 'published-before-role-grant'
  | 'published-after-role-revocation'
  | 'category-timestamp-missing'
  | 'empty-wallet';

// ---- Snapshot Selection ----

/**
 * Find the latest accepted role snapshot whose QDN creation time
 * is at or before the given category publication time.
 *
 * Snapshots must be sorted by QDN metadata created time (ascending).
 * Returns null if no snapshot is effective at the given time.
 */
function findEffectiveRoleSnapshot(
  categoryQdnCreatedTime: number,
  sortedSnapshots: Array<{ envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>; snapshotEntityId: string }>,
): { envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>; snapshotEntityId: string } | null {
  let effective: { envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>; snapshotEntityId: string } | null = null;

  for (const snap of sortedSnapshots) {
    const snapTime = snap.envelope.metadata.created ?? 0;
    if (snapTime > 0 && snapTime <= categoryQdnCreatedTime) {
      effective = snap;
    } else if (snapTime > categoryQdnCreatedTime) {
      break; // snapshots are sorted ascending
    }
  }

  return effective;
}

// ---- Authorization Function ----

export interface HistoricalAuthInput {
  /** Publisher wallet address (resolved by IdentityResolver) */
  publisherWallet: string;
  /** Trusted QDN creation timestamp from category envelope metadata */
  categoryQdnCreatedTime: number | undefined;
  /** Accepted role snapshots sorted by QDN created time (ascending) */
  roleSnapshots: Array<{
    envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>;
    snapshotEntityId: string;
  }>;
  /** Whether role history discovery is complete */
  roleHistoryComplete: boolean;
  /** Whether lineage was resolved successfully */
  roleLineageValid: boolean;
  /** Lineage status for diagnostics */
  roleLineageStatus?: string;
}

/**
 * Verify that a category publisher was authorized as Admin or SysOp
 * at the time the category was published (according to trusted QDN metadata).
 */
export function verifyCategoryHistoricalAuthorization(
  input: HistoricalAuthInput,
): HistoricalAuthResult {
  const { publisherWallet, categoryQdnCreatedTime, roleSnapshots, roleHistoryComplete, roleLineageValid, roleLineageStatus } = input;

  if (!publisherWallet) {
    return { authorized: false, reason: 'empty-wallet' };
  }

  // SysOp trust anchor is always authorized — no role snapshot needed
  if (publisherWallet === QUC_SYSOP_ADDRESS) {
    return { authorized: true, source: 'sysop-trust-anchor' };
  }

  // Role history incomplete or lineage invalid → conservative: reject
  if (!roleLineageValid) {
    return {
      authorized: false,
      reason: 'role-snapshot-lineage-invalid',
      detail: roleLineageStatus ?? 'Role snapshot lineage could not be resolved',
    };
  }

  if (!roleHistoryComplete) {
    return {
      authorized: false,
      reason: 'role-history-incomplete',
      detail: 'Role history discovery is incomplete — cannot verify historical authorization',
    };
  }

  // No snapshots available
  if (roleSnapshots.length === 0) {
    return {
      authorized: false,
      reason: 'role-history-unavailable',
      detail: 'No accepted role snapshots found',
    };
  }

  // Category must have a trusted publication timestamp
  if (categoryQdnCreatedTime === undefined || categoryQdnCreatedTime <= 0) {
    return {
      authorized: false,
      reason: 'category-timestamp-missing',
      detail: 'Category has no trusted QDN publication timestamp',
    };
  }

  // Sort snapshots by QDN created time (ascending)
  const sortedSnapshots = [...roleSnapshots].sort((a, b) =>
    (a.envelope.metadata.created ?? 0) - (b.envelope.metadata.created ?? 0),
  );

  // Find the latest snapshot effective at or before the category publication time
  const effectiveSnapshot = findEffectiveRoleSnapshot(categoryQdnCreatedTime, sortedSnapshots);

  if (!effectiveSnapshot) {
    // No snapshot exists at or before category publication time
    return {
      authorized: false,
      reason: 'published-before-role-grant',
      detail: `Category published at ${categoryQdnCreatedTime} but no role snapshot exists at or before that time`,
    };
  }

  // Check if publisher had admin role in the effective snapshot
  if (hasRole(publisherWallet, 'admin', effectiveSnapshot.envelope.data)) {
    return {
      authorized: true,
      source: 'admin-at-publication',
      snapshotEntityId: effectiveSnapshot.snapshotEntityId,
    };
  }

  // Check if publisher had admin role in any later snapshot
  // (this means they were granted admin after publication → still unauthorized)
  const laterSnapshots = sortedSnapshots.filter(
    s => (s.envelope.metadata.created ?? 0) > categoryQdnCreatedTime,
  );

  let grantedLater = false;
  for (const s of laterSnapshots) {
    if (hasRole(publisherWallet, 'admin', s.envelope.data)) {
      grantedLater = true;
      break;
    }
  }

  if (grantedLater) {
    return {
      authorized: false,
      reason: 'published-before-role-grant',
      detail: `Category published at ${categoryQdnCreatedTime} but publisher was granted admin role only after publication`,
    };
  }

  // Check if publisher had admin in an earlier snapshot but was revoked
  const earlierSnapshots = sortedSnapshots.filter(
    s => (s.envelope.metadata.created ?? 0) <= categoryQdnCreatedTime,
  );

  let hadAdminEarlier = false;
  for (const s of earlierSnapshots) {
    if (hasRole(publisherWallet, 'admin', s.envelope.data)) {
      hadAdminEarlier = true;
      break;
    }
  }

  if (hadAdminEarlier) {
    // They had admin earlier but not in the effective snapshot
    return {
      authorized: false,
      reason: 'published-after-role-revocation',
      detail: `Category published at ${categoryQdnCreatedTime} but publisher's admin role was revoked before publication`,
    };
  }

  // Never had admin role
  return {
    authorized: false,
    reason: 'not-admin-nor-sysop-at-publication',
    detail: `Publisher wallet ${publisherWallet.slice(0, 10)}... did not hold admin role at publication time ${categoryQdnCreatedTime}`,
  };
}

// ---- Diagnostic Helpers ----

/**
 * Build a diagnostic for a category historical authorization rejection.
 */
export function categoryHistoricalAuthDiagnostic(
  rejection: HistoricalAuthRejection,
  categoryEntityId: string,
  publisherWallet: string,
  detail?: string,
): QdnDiagnostic {
  return {
    level: 'warning',
    code: `support-category-${rejection}`,
    message: detail ?? `Category historical authorization failed: ${rejection}`,
    identifier: `qucp-support-category-${categoryEntityId}`,
    name: publisherWallet.slice(0, 16),
  };
}
