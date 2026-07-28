// ===== Shared Validated Query Runtime =====
//
// Reusable runtime query layer that coordinates:
//   paginated search → bounded fetch → validation pipeline → canonical selection
//
// Used by posts, comments, wiki, and all future domain runtimes.

import { paginatedQdnSearch, type QdnSearchFn } from '../paginatedQdnSearch';
import {
  boundedFetchResources,
  type QdnFetchFn,
  type PayloadParser,
} from '../fetchQdnResources';
import {
  type QdnResourceEnvelope,
} from '../QdnResourceEnvelope';
import { validateResource } from '../validationPipeline';
import type { IdentityResolver } from '../IdentityResolver';
import type { ResourcePolicy } from '../ResourcePolicy';
import {
  compareByQdnMetadata,
} from '../ordering/authoritativeEntityOrdering';
import {
  type ValidatedResource,
  type ValidatedRuntimeQueryResult,
  type RuntimeQueryParams,
  type RuntimeDiagnostic,
  type CanonicalIdentity,
  toRuntimeDiagnostic,
} from './runtimeTypes';

// ---- Pipeline Batch Result ----

interface BatchItem<T> {
  envelope: QdnResourceEnvelope<T>;
  result:
    | { status: 'accepted'; envelope: QdnResourceEnvelope<T> }
    | { status: 'rejected'; reason: string }
    | { status: 'quarantined'; reason: string; envelope?: QdnResourceEnvelope<T> };
}

// ---- Implementation ----

/**
 * Execute a fully validated resource query.
 *
 * Steps:
 *   1. Paginated metadata discovery via QDN search
 *   2. Bounded content fetch with controlled concurrency
 *   3. Validate each fetched resource through the pipeline
 *   4. Classify by entity ID
 *   5. Select canonical owner (first accepted publisher)
 *   6. Select latest accepted snapshot from canonical owner
 *   7. Report completeness
 */
export async function validatedRuntimeQuery<T>(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  parser: PayloadParser<T>,
  policy: ResourcePolicy<T>,
  identityResolver: IdentityResolver,
  params: RuntimeQueryParams,
): Promise<ValidatedRuntimeQueryResult<T>> {
  const diagnostics: RuntimeDiagnostic[] = [];

  // Step 1: Paginated metadata discovery
  const searchResult = await paginatedQdnSearch(searchFn, {
    service: params.service,
    identifier: params.identifierPrefix,
    prefix: true,
    pageSize: params.pageSize,
    safetyMax: params.safetyMax,
    signal: params.signal,
    reverse: true,
    includeMetadata: true,
  });

  // If search failed entirely
  if (searchResult.reason === 'request-failed' || searchResult.reason === 'invalid-response') {
    diagnostics.push({
      level: 'error',
      code: 'SEARCH_FAILED',
      message: `QDN search failed: ${searchResult.reason}`,
    });
    return {
      status: 'unavailable',
      items: [],
      reason: `Search infrastructure failure: ${searchResult.reason}`,
      diagnostics,
    };
  }

  // If search returned no results
  if (searchResult.items.length === 0) {
    return { status: 'empty', items: [], diagnostics: [] };
  }

  // Convert search diagnostics
  for (const d of searchResult.diagnostics) {
    diagnostics.push({
      level: d.level,
      code: d.code,
      message: d.message,
    });
  }

  // Step 2: Bounded content fetch
  const fetchResult = await boundedFetchResources<T>(
    fetchFn,
    parser,
    searchResult.items,
    { signal: params.signal },
  );

  // Step 3: Validate each fetched resource through the pipeline
  const validationResults: BatchItem<T>[] = [];

  for (const envelope of fetchResult.items) {
    const vr = await validateResource(envelope, policy, identityResolver);

    if (vr.status === 'accepted') {
      validationResults.push({
        envelope,
        result: { status: 'accepted', envelope: vr.envelope },
      });
    } else if (vr.status === 'rejected') {
      for (const d of vr.diagnostics) {
        diagnostics.push(toRuntimeDiagnostic(d));
      }
      validationResults.push({
        envelope,
        result: { status: 'rejected', reason: vr.reason },
      });
    } else {
      // quarantined
      for (const d of vr.diagnostics) {
        diagnostics.push(toRuntimeDiagnostic(d));
      }
      validationResults.push({
        envelope,
        result: { status: 'quarantined', reason: vr.reason, envelope: vr.envelope },
      });
    }
  }

  // Step 4: Count rejected and quarantined
  const rejectedCount = validationResults.filter(
    (v) => v.result.status === 'rejected',
  ).length;
  const quarantinedCount = validationResults.filter(
    (v) => v.result.status === 'quarantined',
  ).length;

  // Step 5: Group accepted results by entity ID
  const accepted = validationResults.filter(
    (v) => v.result.status === 'accepted',
  ) as { envelope: QdnResourceEnvelope<T>; result: { status: 'accepted'; envelope: QdnResourceEnvelope<T> } }[];

  // Step 6: For each entity ID, select canonical owner (first accepted publisher)
  // and latest snapshot from that owner
  const byEntityId = new Map<string, QdnResourceEnvelope<T>[]>();
  for (const item of accepted) {
    // Extract entity ID from payload data
    const data = item.result.envelope.data as Record<string, unknown>;
    const entityId = typeof data.entityId === 'string' ? data.entityId : '';
    if (!entityId) continue;

    const existing = byEntityId.get(entityId);
    if (existing) {
      existing.push(item.result.envelope);
    } else {
      byEntityId.set(entityId, [item.result.envelope]);
    }
  }

  // Step 7: For each entity ID, establish canonical owner and select latest snapshot
  const validatedItems: ValidatedResource<T>[] = [];

  for (const [entityId, envelopes] of byEntityId) {
    // Sort by created timestamp to find first publisher (canonical owner)
    const sorted = [...envelopes].sort(
      (a, b) => (a.metadata.created ?? 0) - (b.metadata.created ?? 0),
    );

    const firstEnvelope = sorted[0];
    // Canonical owner = the wallet that published the first accepted version
    const canonicalOwnerWallet =
      firstEnvelope.resolvedPublisherAddress ??
      (firstEnvelope.data as Record<string, unknown>).ownerAddress as string ??
      '';

    const canonicalOwnerName = firstEnvelope.metadata.name;

    // Only keep envelopes from the canonical owner
    const ownerEnvelopes = envelopes.filter(
      (e) =>
        e.resolvedPublisherAddress === canonicalOwnerWallet ||
        e.metadata.name === canonicalOwnerName,
    );

    if (ownerEnvelopes.length === 0) continue;

    // Select latest by QDN metadata
    const latest = ownerEnvelopes.reduce((best, current) =>
      compareByQdnMetadata(current, best) < 0 ? current : best,
    );

    validatedItems.push({
      envelope: latest,
      entityId,
      publisherName: latest.metadata.name,
      publisherAddress:
        latest.resolvedPublisherAddress ??
        (latest.data as Record<string, unknown>).ownerAddress as string ??
        '',
    });
  }

  // Step 8: Determine completeness
  const searchComplete = searchResult.complete;

  if (validatedItems.length === 0 && accepted.length === 0 && searchComplete) {
    return {
      status: 'empty',
      items: [],
      diagnostics,
    };
  }

  if (validatedItems.length === 0 && accepted.length === 0 && !searchComplete) {
    return {
      status: 'incomplete',
      items: [],
      rejectedCount,
      quarantinedCount,
      reason: searchResult.reason ?? 'Incomplete metadata discovery',
      diagnostics,
    };
  }

  if (!searchComplete) {
    return {
      status: 'incomplete',
      items: validatedItems,
      rejectedCount,
      quarantinedCount,
      reason: searchResult.reason ?? 'Incomplete results',
      diagnostics,
    };
  }

  return {
    status: 'complete',
    items: validatedItems,
    rejectedCount,
    quarantinedCount,
    diagnostics,
  };
}

// ---- Re-export for convenience ----

export type {
  RuntimeQueryParams,
  ValidatedRuntimeQueryResult,
  ValidatedResource,
  RuntimeDiagnostic,
  CanonicalIdentity,
};
