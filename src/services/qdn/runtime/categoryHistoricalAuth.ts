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
import {
  verifyAdminHistoricalAuthorization,
} from '../roles/adminHistoricalAuthorization';
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
  const result = verifyAdminHistoricalAuthorization({
    publisherWallet: input.publisherWallet,
    mutationQdnTime: input.categoryQdnCreatedTime,
    roleSnapshots: input.roleSnapshots,
    roleHistoryComplete: input.roleHistoryComplete,
    roleLineageValid: input.roleLineageValid,
    roleLineageStatus: input.roleLineageStatus,
  });

  if (result.authorized) {
    return result;
  }

  // Keep the category-specific reason vocabulary for backward compatibility.
  if (result.reason === 'mutation-timestamp-missing') {
    return {
      authorized: false,
      reason: 'category-timestamp-missing',
      detail: result.detail,
    };
  }

  return {
    authorized: false,
    reason: result.reason as HistoricalAuthRejection,
    detail: result.detail,
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
