// ===== Moderation Operation Runtime =====
//
// Discovers and validates append-only moderation operations. Historical role
// authorization is intentionally applied by the domain reducer because each
// operation references the exact role snapshot that authorized it.

import type { QucpModerationOperation, ModerationAction, ModerationTargetFamily } from '../schemas/moderationOperationSchema';
import type { ValidatedRuntimeQueryResult, ValidatedResource, RuntimeDiagnostic } from './runtimeTypes';
import { classifyRuntimeQuery } from './runtimeTypes';
import { paginatedQdnSearch, type QdnSearchFn } from '../paginatedQdnSearch';
import { boundedFetchResources, type QdnFetchFn } from '../fetchQdnResources';
import { validateResource } from '../validationPipeline';
import { moderationPolicy } from '../policies/moderationPolicy';
import { MODERATION_IDENTIFIER_PREFIX } from '../identifiers/moderationIdentifiers';
import type { IdentityResolver } from '../IdentityResolver';
import { ValidationReasonCodes } from '../validationTypes';

export type ModerationQueryResult = ValidatedRuntimeQueryResult<QucpModerationOperation>;

function parseModerationPayload(raw: unknown): QucpModerationOperation | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  return data.resourceFamily === 'qucp-moderation'
    ? data as QucpModerationOperation
    : null;
}

export function buildModerationPayload(input: {
  operationId: string;
  targetFamily: ModerationTargetFamily;
  targetEntityId: string;
  action: ModerationAction;
  actorName: string;
  actorAddress: string;
  registrySnapshotId: string;
  registrySnapshotIdentifier: string;
  reason?: string;
  now?: number;
}): QucpModerationOperation {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-moderation',
    operationId: input.operationId,
    targetFamily: input.targetFamily,
    targetEntityId: input.targetEntityId,
    action: input.action,
    actorName: input.actorName,
    actorAddress: input.actorAddress,
    registrySnapshotId: input.registrySnapshotId,
    registrySnapshotIdentifier: input.registrySnapshotIdentifier,
    reason: input.reason,
    createdAt: input.now ?? Date.now(),
  };
}

export async function queryModerationOperations(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
): Promise<ModerationQueryResult> {
  const diagnostics: RuntimeDiagnostic[] = [];
  const searchResult = await paginatedQdnSearch(searchFn, {
    service: 'DOCUMENT',
    identifier: MODERATION_IDENTIFIER_PREFIX,
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
    return {
      status: 'unavailable',
      items: [],
      reason: `Moderation discovery failed: ${searchResult.reason}`,
      diagnostics: [{
        level: 'error',
        code: 'MODERATION_SEARCH_FAILED',
        message: `Moderation discovery failed: ${searchResult.reason}`,
      }],
    };
  }

  for (const diagnostic of searchResult.diagnostics) {
    diagnostics.push({
      level: diagnostic.level,
      code: diagnostic.code,
      message: diagnostic.message,
      entityId: diagnostic.identifier,
      publisherName: diagnostic.name,
    });
  }

  if (searchResult.items.length === 0) {
    return classifyRuntimeQuery({
      items: [],
      rejectedCount: 0,
      quarantinedCount: 0,
      identityLookupFailedCount: 0,
      searchComplete: searchResult.complete,
      searchReason: searchResult.reason,
      fetchComplete: true,
      allFetchesFailed: false,
      diagnostics,
    });
  }

  const fetchResult = await boundedFetchResources(
    fetchFn,
    parseModerationPayload,
    searchResult.items,
  );
  for (const diagnostic of fetchResult.diagnostics) {
    diagnostics.push({
      level: diagnostic.level,
      code: diagnostic.code,
      message: diagnostic.message,
      entityId: diagnostic.identifier,
      publisherName: diagnostic.name,
    });
  }

  const items: ValidatedResource<QucpModerationOperation>[] = [];
  let rejectedCount = 0;
  let quarantinedCount = 0;
  let identityLookupFailedCount = 0;

  for (const envelope of fetchResult.items) {
    const result = await validateResource(envelope, moderationPolicy, identityResolver);
    if (result.status === 'accepted') {
      items.push({
        envelope: result.envelope,
        entityId: result.envelope.data.operationId,
        publisherName: result.envelope.metadata.name,
        publisherAddress:
          result.envelope.resolvedPublisherAddress ?? result.envelope.data.actorAddress,
      });
      continue;
    }

    if (result.status === 'rejected') rejectedCount++;
    else {
      quarantinedCount++;
      if (result.reason === ValidationReasonCodes.PUBLISHER_LOOKUP_FAILED) {
        identityLookupFailedCount++;
      }
    }
    for (const diagnostic of result.diagnostics) {
      diagnostics.push({
        level: diagnostic.level,
        code: diagnostic.code,
        message: diagnostic.message,
        entityId: diagnostic.identifier,
        publisherName: diagnostic.name,
      });
    }
  }

  return classifyRuntimeQuery({
    items,
    rejectedCount,
    quarantinedCount,
    identityLookupFailedCount,
    searchComplete: searchResult.complete,
    searchReason: searchResult.reason,
    fetchComplete: fetchResult.complete,
    allFetchesFailed:
      searchResult.items.length > 0 && items.length === 0 && !fetchResult.complete,
    diagnostics,
  });
}
