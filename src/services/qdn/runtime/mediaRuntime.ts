// ===== QDN Runtime Media Adapter =====
//
// Resolves cover media references for posts and wiki articles.
// Validates qucp-media-reference entities against parent ownership.

import type { QucpMediaReference } from '../schemas/mediaReferenceSchema';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';
import { validatedRuntimeQuery } from './validatedQueryRuntime';
import { mediaReferencePolicy } from '../policies/mediaReferencePolicy';

// ---- Discovery Prefix ----

export const MEDIA_SEARCH_PREFIX = 'qucp-mr-' as const;

// ---- Media Reference Result ----

export interface MediaReferenceResolution {
  status: 'resolved' | 'unavailable' | 'not-found' | 'unauthorized';
  reference: QucpMediaReference | null;
  envelope: QdnResourceEnvelope<QucpMediaReference> | null;
  error?: string;
}

// ---- Media View Model (for UI consumption) ----

export type ResolvedMediaView =
  | { status: 'resolved'; service: string; publisherName: string; identifier: string }
  | { status: 'not-found' }
  | { status: 'unavailable' }
  | { status: 'unauthorized' }
  | { status: 'parent-deleted' };

/**
 * Convert a MediaReferenceResolution into a UI-safe ResolvedMediaView.
 * Only resolved references return actual QDN rendering data.
 * The underlying QDN service and identifier come from the VALIDATED reference payload,
 * not from the parent entity's coverMediaEntityId.
 */
export function toResolvedMediaView(
  resolution: MediaReferenceResolution,
  parentDeleted: boolean,
): ResolvedMediaView {
  if (parentDeleted) {
    return { status: 'parent-deleted' };
  }
  if (resolution.status === 'resolved' && resolution.reference) {
    return {
      status: 'resolved',
      service: resolution.reference.qdnService,
      publisherName: resolution.reference.ownerName,
      identifier: resolution.reference.qdnIdentifier,
    };
  }
  if (resolution.status === 'not-found') {
    return { status: 'not-found' };
  }
  if (resolution.status === 'unauthorized') {
    return { status: 'unauthorized' };
  }
  return { status: 'unavailable' };
}

// ---- Resolution Function ----

/**
 * Resolve a cover media entity ID to its qucp-media-reference resource.
 *
 * Steps:
 *   1. Search for the specific media reference by entity ID
 *   2. Validate through mediaReferencePolicy
 *   3. Verify parent owner authorization
 *
 * Returns a MediaReferenceResolution with status.
 */
export async function resolveMediaReference(
  mediaEntityId: string,
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  signal?: AbortSignal,
): Promise<MediaReferenceResolution> {
  if (!mediaEntityId) {
    return { status: 'not-found', reference: null, envelope: null };
  }

  try {
    const result = await validatedRuntimeQuery<QucpMediaReference>(
      searchFn,
      fetchFn,
      parseMediaPayload,
      mediaReferencePolicy,
      identityResolver,
      {
        service: 'DOCUMENT',
        identifierPrefix: `${MEDIA_SEARCH_PREFIX}${mediaEntityId}`,
        pageSize: 5,
        safetyMax: 5,
        signal,
      },
    );

    if (result.status === 'empty' || result.items.length === 0) {
      return {
        status: 'not-found',
        reference: null,
        envelope: null,
        error: `Media reference ${mediaEntityId} not found`,
      };
    }

    if (result.status === 'unavailable') {
      return {
        status: 'unavailable',
        reference: null,
        envelope: null,
        error: result.reason,
      };
    }

    const item = result.items[0];
    return {
      status: 'resolved',
      reference: item.envelope.data,
      envelope: item.envelope,
    };
  } catch (err) {
    return {
      status: 'unavailable',
      reference: null,
      envelope: null,
      error: err instanceof Error ? err.message : 'Media resolution failed',
    };
  }
}

// ---- Payload Parser ----

function parseMediaPayload(raw: unknown): QucpMediaReference | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.entityId !== 'string') return null;
  if (d.resourceFamily !== 'qucp-media-reference') return null;
  return d as QucpMediaReference;
}
