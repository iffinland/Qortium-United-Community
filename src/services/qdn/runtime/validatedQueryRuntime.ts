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
import { ValidationReasonCodes } from '../validationTypes';
import { parseQucpIdentifier } from '../identifiers/qucpIdentifiers';
import {
  type ValidatedResource,
  type ValidatedRuntimeQueryResult,
  type RuntimeQueryParams,
  type RuntimeDiagnostic,
  type CanonicalIdentity,
  toRuntimeDiagnostic,
  classifyRuntimeQuery,
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
    filter: familyIdentifierFilter(policy.family),
  });

  // If search infrastructure failed entirely.
  // 'request-failed', 'invalid-response', and 'timeout' all mean we cannot
  // produce a trustworthy domain result.
  if (
    searchResult.reason === 'request-failed' ||
    searchResult.reason === 'invalid-response' ||
    searchResult.reason === 'timeout'
  ) {
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

  // If search returned no matching family resources, we still must run the
  // result through the shared classifier. A degraded Admin authority
  // dependency (`incomplete`, `unavailable`, or `invalid`) must prevent an
  // early `empty` verdict even when zero raw domain resources were discovered,
  // otherwise Global Search could report a false complete/no-results state.
  if (searchResult.items.length === 0) {
    return classifyRuntimeQuery<T>({
      items: [],
      rejectedCount: 0,
      quarantinedCount: 0,
      identityLookupFailedCount: 0,
      searchComplete: searchResult.complete,
      searchReason: searchResult.reason,
      // No resources were discovered, so there was no fetch to fail.
      fetchComplete: true,
      allFetchesFailed: false,
      authorityDependency: params.adminAuthority?.dependency,
      diagnostics: searchResult.diagnostics.map((d) => ({
        level: d.level,
        code: d.code,
        message: d.message,
      })),
    });
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

  // Preserve fetch-level diagnostics (per-resource failures/timeouts) so a
  // partial fetch is visible in the final result instead of being silently
  // collapsed into a valid-looking complete/empty domain.
  for (const d of fetchResult.diagnostics) {
    diagnostics.push({
      level: d.level,
      code: d.code,
      message: d.message,
      entityId: d.identifier,
      publisherName: d.name,
    });
  }

  // Step 3: Validate each fetched resource through the pipeline
  const validationResults: BatchItem<T>[] = [];

  for (const envelope of fetchResult.items) {
    const vr = await validateResource(envelope, policy, identityResolver);

    if (vr.status === 'accepted') {
      // Stage 3.5: Admin/SysOp authority for admin-managed families.
      // This is evaluated on the authoritative read path using the trusted
      // mutation time (metadata.updated ?? metadata.created) rather than the
      // original creation time, so a revoked Admin cannot keep updating an old
      // resource through the embedded ownership checks alone.
      if (params.adminAuthority) {
        const publisherWallet =
          vr.envelope.resolvedPublisherAddress ??
          ((vr.envelope.data as Record<string, unknown>).ownerAddress as string | undefined) ??
          '';
        const mutationQdnTime =
          vr.envelope.metadata.updated ?? vr.envelope.metadata.created;
        const decision = params.adminAuthority({
          publisherWallet,
          mutationQdnTime,
        });

        if (!decision.authorized) {
          diagnostics.push({
            level: 'warning',
            code: decision.reason ?? 'ADMIN_AUTHORITY_REJECTED',
            message:
              decision.detail ??
              `Admin authority failed for ${policy.family}: ${envelope.metadata.name}`,
            entityId: envelope.metadata.identifier,
            publisherName: envelope.metadata.name,
          });
          validationResults.push({
            envelope,
            result: {
              status: 'rejected',
              reason: decision.reason ?? 'ADMIN_AUTHORITY_REJECTED',
            },
          });
          continue;
        }
      }

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
  const identityLookupFailedCount = validationResults.filter(
    (v) =>
      v.result.status === 'quarantined' &&
      v.result.reason === ValidationReasonCodes.PUBLISHER_LOOKUP_FAILED,
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

  // Step 7: For each entity ID, establish canonical version.
  const validatedItems: ValidatedResource<T>[] = [];

  for (const [entityId, envelopes] of byEntityId) {
    if (params.sharedAdminOwnership) {
      // Shared Admin-managed state: the latest authorized mutation is
      // canonical regardless of which currently-authorized Admin/SysOp
      // published it. The historical authority stage above has already
      // removed any unauthorized publisher.
      const latest = envelopes.reduce((best, current) =>
        compareByQdnMetadata(current, best) < 0 ? current : best,
      );

      validatedItems.push({
        envelope: latest,
        entityId,
        publisherName: latest.metadata.name,
        publisherAddress:
          latest.resolvedPublisherAddress ??
          ((latest.data as Record<string, unknown>).ownerAddress as string) ??
          '',
      });
      continue;
    }

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

  // Step 8: Determine completeness with explicit failure preservation.
  return classifyRuntimeQuery<T>({
    items: validatedItems,
    rejectedCount,
    quarantinedCount,
    identityLookupFailedCount,
    searchComplete: searchResult.complete,
    searchReason: searchResult.reason,
    fetchComplete: fetchResult.complete,
    allFetchesFailed:
      searchResult.items.length > 0 &&
      fetchResult.items.length === 0 &&
      !fetchResult.complete,
    authorityDependency: params.adminAuthority?.dependency,
    diagnostics,
  });
}

/**
 * Build a metadata filter that keeps only the expected QDN resource family.
 * This is the reader-side correction for overlapping identifier prefixes such
 * as `qucp-post-` (parent) vs `qucp-post-comment-` (child): child resources are
 * excluded before they can consume the parent discovery budget.
 *
 * Non-qucp identifiers are left untouched so this generic runtime remains
 * usable by future non-qucp policies.
 */
function familyIdentifierFilter(
  family: string,
): (meta: { identifier: string }) => boolean {
  return (meta) => {
    const parsed = parseQucpIdentifier(meta.identifier);
    if (!parsed) return true;
    return parsed.family === family;
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
