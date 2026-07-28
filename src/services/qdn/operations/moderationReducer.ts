// ===== Moderation Reducer (Historical) =====
//
// Deterministic reduction of historically authorized moderation operations
// into per-target moderation state.
//
// Each operation is authorized against its EXACT referenced snapshot,
// not the current registry. This prevents retroactive invalidation/grant.

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpModerationOperation } from '../schemas/moderationOperationSchema';
import type { QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';
import { compareByQdnMetadata } from '../ordering/authoritativeEntityOrdering';
import { authorizeModerationAtSnapshot, type HistoricalAuthResult } from './moderationHistoricalAuthorization';
import type { ModerationState } from './moderationState';
import { NEUTRAL_MODERATION_STATE } from './moderationState';

// ---- Snapshot Registry Entry ----

interface SnapshotEntry {
  envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>;
}

// ---- Effective Operation ----

export interface EffectiveModerationResult {
  operation: QdnResourceEnvelope<QucpModerationOperation>;
  authorized: boolean;
  authStatus: HistoricalAuthResult['status'];
  authReason?: string;
}

/**
 * Filter and sort moderation operations for a target.
 * Each operation is authorized against its exact referenced snapshot.
 */
function getEffectiveOperations(
  targetFamily: string,
  targetEntityId: string,
  operations: QdnResourceEnvelope<QucpModerationOperation>[],
  acceptedSnapshots: Map<string, SnapshotEntry>,
): EffectiveModerationResult[] {
  return operations
    .filter((op) =>
      op.data.targetFamily === targetFamily &&
      op.data.targetEntityId === targetEntityId,
    )
    .map((op) => {
      const auth = authorizeModerationAtSnapshot(op.data, acceptedSnapshots, op);
      return {
        operation: op,
        authorized: auth.status === 'authorized',
        authStatus: auth.status,
        authReason: auth.reason,
      };
    })
    .filter((eff) => eff.authorized)
    .sort((a, b) => compareByQdnMetadata(a.operation, b.operation));
}

/**
 * Reduce historically authorized moderation operations into a ModerationState.
 *
 * Each operation is authorized against its EXACT referenced snapshot.
 * Later revocation does NOT remove previously authorized state.
 * Later grant does NOT activate previously unauthorized operations.
 */
export function reduceModerationState(
  targetFamily: string,
  targetEntityId: string,
  operations: QdnResourceEnvelope<QucpModerationOperation>[],
  acceptedSnapshots: Map<string, SnapshotEntry>,
): { state: ModerationState; diagnostics: EffectiveModerationResult[] } {
  const effective = getEffectiveOperations(targetFamily, targetEntityId, operations, acceptedSnapshots);

  // Collect unauthorized operations as diagnostics
  const unauthorized = operations
    .filter((op) =>
      op.data.targetFamily === targetFamily &&
      op.data.targetEntityId === targetEntityId,
    )
    .map((op) => {
      const auth = authorizeModerationAtSnapshot(op.data, acceptedSnapshots, op);
      return {
        operation: op,
        authorized: auth.status === 'authorized',
        authStatus: auth.status,
        authReason: auth.reason,
      };
    })
    .filter((eff) => !eff.authorized);

  // Apply authorized operations in reverse order: oldest first
  const state: ModerationState = { ...NEUTRAL_MODERATION_STATE };
  const reversed = [...effective].reverse();

  for (const eff of reversed) {
    applyModerationAction(state, eff.operation.data.action);
  }

  return { state, diagnostics: unauthorized };
}

function applyModerationAction(state: ModerationState, action: string): void {
  switch (action) {
    case 'hide': state.visibility = 'hidden'; break;
    case 'restore': state.visibility = 'visible'; break;
    case 'lock': state.locked = true; break;
    case 'unlock': state.locked = false; break;
    case 'feature': state.featured = true; break;
    case 'unfeature': state.featured = false; break;
    case 'close': state.closed = true; break;
    case 'reopen': state.closed = false; break;
    case 'mark-resolved': state.resolved = true; break;
    case 'mark-unresolved': state.resolved = false; break;
  }
}

export function getAffectedDimension(action: string): keyof ModerationState | null {
  switch (action) {
    case 'hide': case 'restore': return 'visibility';
    case 'lock': case 'unlock': return 'locked';
    case 'feature': case 'unfeature': return 'featured';
    case 'close': case 'reopen': return 'closed';
    case 'mark-resolved': case 'mark-unresolved': return 'resolved';
    default: return null;
  }
}
