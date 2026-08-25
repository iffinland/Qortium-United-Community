// ===== QDN Runtime Owner Tombstone Adapter =====
//
// Publishes and reduces owner-tombstone operations for entity deletion/restoration.
// Only the canonical owner may tombstone their own entities.

import type { QucpOwnerTombstone } from '../schemas/ownerTombstoneSchema';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';
import { paginatedQdnSearch } from '../paginatedQdnSearch';
import { boundedFetchResources } from '../fetchQdnResources';
import { validateResource } from '../validationPipeline';
import { ownerTombstonePolicy } from '../policies/ownerTombstonePolicy';
import {
  classifyRuntimeQuery,
  type ValidatedRuntimeQueryResult,
  type ValidatedResource,
  type RuntimeDiagnostic,
} from './runtimeTypes';
import { ValidationReasonCodes } from '../validationTypes';
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
  const diagnostics: RuntimeDiagnostic[] = [];

  const searchResult = await paginatedQdnSearch(searchFn, {
    service: 'DOCUMENT',
    identifier: TOMBSTONE_SEARCH_PREFIX,
    prefix: true,
    pageSize: 50,
    safetyMax: 500,
    reverse: true,
    includeMetadata: true,
  });

  if (
    searchResult.reason === 'request-failed' ||
    searchResult.reason === 'invalid-response' ||
    searchResult.reason === 'timeout'
  ) {
    diagnostics.push({
      level: 'error',
      code: 'TOMBSTONE_SEARCH_FAILED',
      message: `Tombstone search failed: ${searchResult.reason}`,
    });
    return {
      status: 'unavailable',
      items: [],
      reason: `Tombstone search failed: ${searchResult.reason}`,
      diagnostics,
    };
  }

  if (searchResult.items.length === 0) {
    if (searchResult.complete) {
      return { status: 'empty', items: [], diagnostics: [] };
    }
    return {
      status: 'incomplete',
      items: [],
      rejectedCount: 0,
      quarantinedCount: 0,
      reason: searchResult.reason ?? 'Incomplete tombstone discovery',
      diagnostics: searchResult.diagnostics.map((d) => ({
        level: d.level,
        code: d.code,
        message: d.message,
      })),
    };
  }

  for (const d of searchResult.diagnostics) {
    diagnostics.push({
      level: d.level,
      code: d.code,
      message: d.message,
      entityId: d.identifier,
      publisherName: d.name,
    });
  }

  const fetchResult = await boundedFetchResources<QucpOwnerTombstone>(
    fetchFn,
    parseTombstonePayload,
    searchResult.items,
  );

  for (const d of fetchResult.diagnostics) {
    diagnostics.push({
      level: d.level,
      code: d.code,
      message: d.message,
      entityId: d.identifier,
      publisherName: d.name,
    });
  }

  const items: ValidatedResource<QucpOwnerTombstone>[] = [];
  let rejectedCount = 0;
  let quarantinedCount = 0;
  let identityLookupFailedCount = 0;

  for (const envelope of fetchResult.items) {
    const result = await validateResource(envelope, ownerTombstonePolicy, identityResolver);

    if (result.status === 'accepted') {
      items.push({
        envelope: result.envelope,
        // Tombstones are keyed by operationId, not the generic entityId.
        entityId: result.envelope.data.operationId,
        publisherName: result.envelope.metadata.name,
        publisherAddress:
          result.envelope.resolvedPublisherAddress ??
          result.envelope.data.ownerAddress,
      });
      continue;
    }

    if (result.status === 'rejected') {
      rejectedCount++;
    } else {
      quarantinedCount++;
      if (result.reason === ValidationReasonCodes.PUBLISHER_LOOKUP_FAILED) {
        identityLookupFailedCount++;
      }
    }

    for (const d of result.diagnostics) {
      diagnostics.push({
        level: d.level,
        code: d.code,
        message: d.message,
        entityId: d.identifier,
        publisherName: d.name,
      });
    }
  }

  const searchComplete = searchResult.complete;
  const fetchComplete = fetchResult.complete;
  const allFetchesFailed =
    searchResult.items.length > 0 &&
    fetchResult.items.length === 0 &&
    !fetchComplete;

  return classifyRuntimeQuery({
    items,
    rejectedCount,
    quarantinedCount,
    identityLookupFailedCount,
    searchComplete,
    searchReason: searchResult.reason,
    fetchComplete,
    allFetchesFailed,
    diagnostics,
  });
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
