// ===== Media Selection (with Tombstone Handling) =====
//
// Deterministic selection of effective media references per semantic slot.
// Owner-deleted references are excluded. Parent deletion suppresses display.

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpMediaReference } from '../schemas/mediaReferenceSchema';
import type { QucpOwnerTombstone } from '../schemas/ownerTombstoneSchema';
import { compareByQdnMetadata } from '../ordering/authoritativeEntityOrdering';

export interface EntityDeletionState {
  deleted: boolean;
  deletedByOwner: boolean;
}

export interface EffectiveMediaSelection {
  active: Map<string, QdnResourceEnvelope<QucpMediaReference>[]>;
  tombstones: Map<string, QdnResourceEnvelope<QucpOwnerTombstone>>;
}

const SINGLE_VALUE_ROLES = new Set(['cover', 'thumbnail', 'banner']);

export function selectActiveMediaForParent(
  targetFamily: string,
  targetEntityId: string,
  acceptedReferences: QdnResourceEnvelope<QucpMediaReference>[],
  authorizedTombstones: QdnResourceEnvelope<QucpOwnerTombstone>[],
  parentDeletion: EntityDeletionState,
): EffectiveMediaSelection {
  const deletionMap = new Map<string, QdnResourceEnvelope<QucpOwnerTombstone>>();
  for (const t of authorizedTombstones) {
    const existing = deletionMap.get(t.data.targetEntityId);
    if (!existing || compareByQdnMetadata(t, existing) < 0) {
      deletionMap.set(t.data.targetEntityId, t);
    }
  }

  const deletedEntityIds = new Set<string>();
  for (const [entityId, t] of deletionMap) {
    if (t.data.action === 'delete') deletedEntityIds.add(entityId);
  }

  const relevant = acceptedReferences.filter(
    (e) => e.data.parentFamily === targetFamily && e.data.parentEntityId === targetEntityId,
  );

  const grouped = new Map<string, QdnResourceEnvelope<QucpMediaReference>[]>();
  for (const env of relevant) {
    if (deletedEntityIds.has(env.data.entityId)) continue;
    const role = env.data.mediaRole;
    const list = grouped.get(role) ?? [];
    list.push(env);
    grouped.set(role, list);
  }

  const result = new Map<string, QdnResourceEnvelope<QucpMediaReference>[]>();
  for (const [role, envs] of grouped) {
    const sorted = [...envs].sort((a, b) => compareByQdnMetadata(a, b));
    if (SINGLE_VALUE_ROLES.has(role)) {
      if (!parentDeletion.deleted && sorted.length > 0) {
        result.set(role, [sorted[0]]);
      }
    } else {
      if (!parentDeletion.deleted) {
        result.set(role, sorted);
      }
    }
  }

  return { active: result, tombstones: deletionMap };
}
