// ===== QDN Runtime Owner Tombstone Adapter =====
//
// Publishes and reduces owner-tombstone operations for entity deletion/restoration.
// Only the canonical owner may tombstone their own entities.

import type { QucpOwnerTombstone } from '../schemas/ownerTombstoneSchema';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';
import { validatedRuntimeQuery } from './validatedQueryRuntime';
import { ownerTombstonePolicy } from '../policies/ownerTombstonePolicy';
import type { ValidatedRuntimeQueryResult, ValidatedResource } from './runtimeTypes';
import {
  reduceOwnerTombstones,
  type EffectiveTombstone,
  type TargetOwnerInfo,
} from '../operations/ownerTombstoneReducer';

// ---- Discovery Prefix ----

export const TOMBSTONE_SEARCH_PREFIX = 'qucp-ot-' as const;

// ---- Query Result ----

export type TombstoneQueryResult = ValidatedRuntimeQueryResult<QucpOwnerTombstone>;
export type ValidatedTombstone = ValidatedResource<QucpOwnerTombstone>;

// ---- Publication Builder ----

export function buildTombstonePayload(input: {
  operationId: string;
  targetFamily: QucpOwnerTombstone['targetFamily'];
  targetEntityId: string;
  ownerName: string;
  ownerAddress: string;
  action: 'delete' | 'restore';
  reason?: string;
  now?: number;
}): QucpOwnerTombstone {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-owner-tombstone',
    operationId: input.operationId,
    targetFamily: input.targetFamily,
    targetEntityId: input.targetEntityId,
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    action: input.action,
    reason: input.reason,
    createdAt: input.now ?? Date.now(),
  };
}

// ---- Query Function ----

export async function queryTombstones(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
): Promise<TombstoneQueryResult> {
  return validatedRuntimeQuery<QucpOwnerTombstone>(
    searchFn,
    fetchFn,
    parseTombstonePayload,
    ownerTombstonePolicy,
    identityResolver,
    {
      service: 'DOCUMENT',
      identifierPrefix: TOMBSTONE_SEARCH_PREFIX,
    },
  );
}

// ---- Reduction Helpers ----

export interface TombstoneComposition {
  tombstones: QdnResourceEnvelope<QucpOwnerTombstone>[];
  /** Get effective tombstone state for a specific target entity. */
  getEffectiveState: (
    targetFamily: string,
    targetEntityId: string,
    targetOwner: TargetOwnerInfo | null,
  ) => EffectiveTombstone;
}

/**
 * Build a tombstone composition from validated tombstone query results.
 * Provides a getEffectiveState function that authorizes against canonical target owners.
 */
export function buildTombstoneComposition(
  queryResult: TombstoneQueryResult,
): TombstoneComposition {
  const tombstones: QdnResourceEnvelope<QucpOwnerTombstone>[] = [];
  if (queryResult.status !== 'unavailable' && queryResult.status !== 'empty') {
    for (const item of queryResult.items) {
      tombstones.push(item.envelope);
    }
  }

  return {
    tombstones,
    getEffectiveState: (
      targetFamily: string,
      targetEntityId: string,
      targetOwner: TargetOwnerInfo | null,
    ): EffectiveTombstone => {
      const relevant = tombstones.filter(
        (t) =>
          t.data.targetFamily === targetFamily &&
          t.data.targetEntityId === targetEntityId,
      );
      return reduceOwnerTombstones(targetFamily, targetEntityId, targetOwner, relevant);
    },
  };
}

// ---- Payload Parser ----

function parseTombstonePayload(raw: unknown): QucpOwnerTombstone | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-owner-tombstone') return null;
  if (typeof d.targetFamily !== 'string') return null;
  if (typeof d.targetEntityId !== 'string') return null;
  return d as QucpOwnerTombstone;
}
