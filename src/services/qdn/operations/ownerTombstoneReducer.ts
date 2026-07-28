// ===== Owner Tombstone Reducer =====
//
// Reduces accepted owner tombstone operations.
// Validates target ownership and produces deletion state.

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpOwnerTombstone } from '../schemas/ownerTombstoneSchema';
import { compareByQdnMetadata } from '../ordering/authoritativeEntityOrdering';

// ---- Target Ownership ----

export interface TargetOwnerInfo {
  ownerName: string;
  ownerAddress: string;
  entityId: string;
  resourceFamily: string;
}

// ---- Tombstone Authorization ----

export type TombstoneAuthStatus =
  | 'authorized'
  | 'owner-mismatch'
  | 'target-missing'
  | 'target-unavailable'
  | 'target-rejected'
  | 'target-family-mismatch';

export interface TombstoneAuthResult {
  status: TombstoneAuthStatus;
  reason?: string;
}

/**
 * Authorize an owner tombstone against the canonical target entity creation.
 */
export function authorizeOwnerTombstone(
  tombstone: QucpOwnerTombstone,
  targetOwner: TargetOwnerInfo | null,
  targetStatus?: 'accepted' | 'rejected' | 'unavailable',
): TombstoneAuthResult {
  if (!targetOwner) {
    return { status: 'target-missing', reason: 'Target entity not found in loaded data' };
  }

  if (targetStatus === 'unavailable') {
    return { status: 'target-unavailable', reason: 'Target entity is temporarily unavailable' };
  }

  if (targetStatus === 'rejected') {
    return { status: 'target-rejected', reason: 'Target entity was rejected' };
  }

  if (targetOwner.resourceFamily !== tombstone.targetFamily) {
    return { status: 'target-family-mismatch', reason: 'Target family mismatch' };
  }

  if (targetOwner.entityId !== tombstone.targetEntityId) {
    return { status: 'target-missing', reason: 'Target entity ID mismatch' };
  }

  if (targetOwner.ownerAddress !== tombstone.ownerAddress) {
    return {
      status: 'owner-mismatch',
      reason: `Tombstone owner "${tombstone.ownerAddress}" does not match target owner "${targetOwner.ownerAddress}"`,
    };
  }

  // Name check as secondary validation
  if (targetOwner.ownerName !== tombstone.ownerName) {
    return {
      status: 'owner-mismatch',
      reason: `Tombstone owner name "${tombstone.ownerName}" does not match target owner name "${targetOwner.ownerName}"`,
    };
  }

  return { status: 'authorized' };
}

// ---- Effective Tombstone State ----

export type EntityDeletionState =
  | 'active'
  | 'deleted-by-owner'
  | 'restored';

export interface EffectiveTombstone {
  state: EntityDeletionState;
  tombstone?: QdnResourceEnvelope<QucpOwnerTombstone>;
  authorized: boolean;
}

/**
 * Reduce owner tombstone operations for a single target entity.
 * Selects the latest authorized operation by QDN metadata.
 * Foreign/unauthorized tombstones are ignored.
 */
export function reduceOwnerTombstones(
  _targetFamily: string,
  _targetEntityId: string,
  targetOwner: TargetOwnerInfo | null,
  tombstones: QdnResourceEnvelope<QucpOwnerTombstone>[],
): EffectiveTombstone {
  // Filter and sort authorized tombstones
  const authorized = tombstones
    .filter((t) => {
      const auth = authorizeOwnerTombstone(t.data, targetOwner);
      return auth.status === 'authorized';
    })
    .sort((a, b) => compareByQdnMetadata(a, b));

  if (authorized.length === 0) {
    return { state: 'active', authorized: false };
  }

  const latest = authorized[0];
  const state: EntityDeletionState =
    latest.data.action === 'delete' ? 'deleted-by-owner'
    : latest.data.action === 'restore' ? 'restored'
    : 'active';

  return {
    state,
    tombstone: latest,
    authorized: true,
  };
}
