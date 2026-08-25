// ===== Admin/SysOp Historical Authorization =====
//
// Single canonical fail-closed authorization stage for every admin-managed
// QDN resource family (Posts, Polls, Projects, Wiki, Events, Support
// Categories). It answers one question:
//
//   "Was this publisher wallet an Admin or the SysOp at the trusted mutation
//    publication time represented by the QDN coordinate?"
//
// Authority is resolved from the complete, valid, unambiguous canonical role
// snapshot lineage. Embedded owner fields are NOT authority; they are identity
// claims that the ordinary validation pipeline checks separately.

import type { QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { RoleSnapshotQueryResult } from '../runtime/roleSnapshotRuntime';
import { hasRole } from './roleAuthorization';
import {
  validateRoleLineageFromQuery,
  describeRoleLineage,
} from './registryLineage';
import { QUC_SYSOP_ADDRESS } from '../../../config/qortiumTrust';
import type {
  AdminAuthorityDecision,
  AdminAuthorityProvider,
  AuthorityDependencyStatus,
} from '../runtime/runtimeTypes';

// ---- Result Types ----

export type AdminHistoricalAuthResult =
  | { authorized: true; source: 'sysop-trust-anchor' | 'admin-at-publication'; snapshotEntityId?: string }
  | { authorized: false; reason: AdminHistoricalAuthRejection; detail?: string };

export type AdminHistoricalAuthRejection =
  | 'not-admin-nor-sysop-at-publication'
  | 'role-history-unavailable'
  | 'role-history-incomplete'
  | 'role-snapshot-lineage-invalid'
  | 'published-before-role-grant'
  | 'published-after-role-revocation'
  | 'mutation-timestamp-missing'
  | 'empty-wallet';

export interface AdminHistoricalAuthInput {
  /** Publisher wallet address (resolved by the identity resolver). */
  publisherWallet: string;
  /** Trusted effective publication time: QDN metadata `updated ?? created`. */
  mutationQdnTime: number | undefined;
  /** Accepted role snapshots (unsorted; this function sorts by trusted time). */
  roleSnapshots: Array<{
    envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>;
    snapshotEntityId: string;
  }>;
  /** Whether role history discovery was complete. */
  roleHistoryComplete: boolean;
  /** Whether the role lineage is valid/unambiguous. */
  roleLineageValid: boolean;
  /** Optional lineage status string for diagnostics. */
  roleLineageStatus?: string;
}

// ---- Role History Context ----

export interface AdminRoleHistoryContext {
  roleSnapshots: Array<{
    envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>;
    snapshotEntityId: string;
  }>;
  snapshotMap: Map<string, { snapshot: QucpRoleRegistrySnapshot; identifier: string }>;
  roleHistoryComplete: boolean;
  roleHistoryUnavailable: boolean;
  roleLineageValid: boolean;
  roleLineageStatus?: string;
}

/**
 * Build the shared role-history context from a validated role snapshot query.
 *
 * A forked lineage marks the context invalid; incomplete discovery marks it
 * incomplete. Both cause downstream authorization to fail closed.
 */
export function buildAdminRoleHistoryContext(
  roleResult: RoleSnapshotQueryResult,
): AdminRoleHistoryContext {
  const roleSnapshots: AdminRoleHistoryContext['roleSnapshots'] = [];
  const snapshotMap = new Map<
    string,
    { snapshot: QucpRoleRegistrySnapshot; identifier: string }
  >();

  if (roleResult.status !== 'unavailable' && roleResult.status !== 'empty') {
    for (const item of roleResult.items) {
      const snap = item.envelope.data;
      snapshotMap.set(snap.snapshotId, {
        snapshot: snap,
        identifier: item.envelope.metadata.identifier,
      });
      roleSnapshots.push({
        envelope: item.envelope as QdnResourceEnvelope<QucpRoleRegistrySnapshot>,
        snapshotEntityId: snap.snapshotId,
      });
    }
  }

  const lineage = validateRoleLineageFromQuery(snapshotMap, roleResult.status);
  const roleLineageValid = lineage.valid;
  const roleHistoryComplete =
    roleResult.status === 'complete' || roleResult.status === 'empty';
  const roleHistoryUnavailable = roleResult.status === 'unavailable';

  return {
    roleSnapshots,
    snapshotMap,
    roleHistoryComplete,
    roleHistoryUnavailable,
    roleLineageValid,
    roleLineageStatus: roleLineageValid ? undefined : describeRoleLineage(lineage),
  };
}

// ---- Effective Snapshot Selection ----

function findEffectiveRoleSnapshot(
  mutationQdnTime: number,
  sortedSnapshots: Array<{
    envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>;
    snapshotEntityId: string;
  }>,
): { envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>; snapshotEntityId: string } | null {
  let effective:
    | { envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>; snapshotEntityId: string }
    | null = null;

  for (const snap of sortedSnapshots) {
    const snapTime = snap.envelope.metadata.created ?? 0;
    if (snapTime > 0 && snapTime <= mutationQdnTime) {
      effective = snap;
    } else if (snapTime > mutationQdnTime) {
      break;
    }
  }

  return effective;
}

// ---- Authorization ----

/**
 * Verify historical Admin/SysOp authority at a trusted mutation time.
 *
 * The trust anchor (SysOp) is always authorized. Every other wallet must be an
 * Admin in the latest role snapshot whose trusted QDN creation time is at or
 * before the mutation time. Missing, incomplete, forked, or ambiguous role
 * history fails closed.
 */
export function verifyAdminHistoricalAuthorization(
  input: AdminHistoricalAuthInput,
): AdminHistoricalAuthResult {
  const {
    publisherWallet,
    mutationQdnTime,
    roleSnapshots,
    roleHistoryComplete,
    roleLineageValid,
    roleLineageStatus,
  } = input;

  if (!publisherWallet) {
    return { authorized: false, reason: 'empty-wallet' };
  }

  // SysOp trust anchor is always authorized — no snapshot needed.
  if (publisherWallet === QUC_SYSOP_ADDRESS) {
    return { authorized: true, source: 'sysop-trust-anchor' };
  }

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

  if (roleSnapshots.length === 0) {
    return {
      authorized: false,
      reason: 'role-history-unavailable',
      detail: 'No accepted role snapshots found',
    };
  }

  if (mutationQdnTime === undefined || mutationQdnTime <= 0) {
    return {
      authorized: false,
      reason: 'mutation-timestamp-missing',
      detail: 'Resource has no trusted QDN publication timestamp',
    };
  }

  const sortedSnapshots = [...roleSnapshots].sort(
    (a, b) => (a.envelope.metadata.created ?? 0) - (b.envelope.metadata.created ?? 0),
  );

  const effectiveSnapshot = findEffectiveRoleSnapshot(mutationQdnTime, sortedSnapshots);

  if (!effectiveSnapshot) {
    return {
      authorized: false,
      reason: 'published-before-role-grant',
      detail: `Mutation published at ${mutationQdnTime} but no role snapshot exists at or before that time`,
    };
  }

  if (hasRole(publisherWallet, 'admin', effectiveSnapshot.envelope.data)) {
    return {
      authorized: true,
      source: 'admin-at-publication',
      snapshotEntityId: effectiveSnapshot.snapshotEntityId,
    };
  }

  // Admin granted only after this mutation → unauthorized.
  const laterSnapshots = sortedSnapshots.filter(
    (s) => (s.envelope.metadata.created ?? 0) > mutationQdnTime,
  );
  for (const s of laterSnapshots) {
    if (hasRole(publisherWallet, 'admin', s.envelope.data)) {
      return {
        authorized: false,
        reason: 'published-before-role-grant',
        detail: `Publisher was granted admin role only after the mutation at ${mutationQdnTime}`,
      };
    }
  }

  // Admin held earlier but revoked before this mutation → unauthorized.
  const earlierSnapshots = sortedSnapshots.filter(
    (s) => (s.envelope.metadata.created ?? 0) <= mutationQdnTime,
  );
  for (const s of earlierSnapshots) {
    if (hasRole(publisherWallet, 'admin', s.envelope.data)) {
      return {
        authorized: false,
        reason: 'published-after-role-revocation',
        detail: `Publisher's admin role was revoked before the mutation at ${mutationQdnTime}`,
      };
    }
  }

  return {
    authorized: false,
    reason: 'not-admin-nor-sysop-at-publication',
    detail: `Publisher wallet ${publisherWallet.slice(0, 10)}... did not hold admin role at mutation time ${mutationQdnTime}`,
  };
}

// ---- Provider Bridge ----

/**
 * Create an `AdminAuthorityProvider` closure from a role-history context.
 * This is the boundary object handed to the validated query runtime so it can
 * authorize admin-managed resources without knowing how roles are discovered.
 */
export function createAdminAuthorityProvider(
  context: AdminRoleHistoryContext,
): AdminAuthorityProvider {
  const dependency = authorityDependencyForContext(context);

  const provider = ((input): AdminAuthorityDecision => {
    const result = verifyAdminHistoricalAuthorization({
      publisherWallet: input.publisherWallet,
      mutationQdnTime: input.mutationQdnTime,
      roleSnapshots: context.roleSnapshots,
      roleHistoryComplete: context.roleHistoryComplete,
      roleLineageValid: context.roleLineageValid,
      roleLineageStatus: context.roleLineageStatus,
    });

    if (result.authorized) {
      return { authorized: true };
    }

    return { authorized: false, reason: result.reason, detail: result.detail };
  }) as AdminAuthorityProvider;

  Object.defineProperty(provider, 'dependency', {
    value: dependency,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return provider;
}

/**
 * Map a role-history context to the shared authority dependency status used by
 * the result classifier. This is what lets an Admin-managed domain distinguish
 * "complete valid authority but zero authorized resources" (empty) from a
 * degraded/unavailable authority dependency.
 */
function authorityDependencyForContext(
  context: AdminRoleHistoryContext,
): AuthorityDependencyStatus {
  if (context.roleHistoryUnavailable) return 'unavailable';
  if (!context.roleLineageValid) return 'invalid';
  if (!context.roleHistoryComplete) return 'incomplete';
  return 'complete';
}
