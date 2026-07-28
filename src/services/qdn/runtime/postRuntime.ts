// ===== QDN Runtime Post Adapter =====
//
// Bridges the QDN foundation to post-specific feature APIs.
// Uses the shared validated query runtime for canonical ownership selection.
//
// Canonical ownership: first accepted publisher establishes canonical wallet.
// Latest accepted snapshot from that wallet is authoritative.
// Foreign publisher snapshots are ignored.

import type { QucpPost } from '../schemas/postSchema';
import type { ValidatedRuntimeQueryResult, ValidatedResource } from './runtimeTypes';
import { validatedRuntimeQuery, type RuntimeQueryParams } from './validatedQueryRuntime';
import { postPolicy } from '../policies/postPolicy';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';

// ---- Discovery Prefix ----

export const POST_SEARCH_PREFIX = 'qucp-post-' as const;

// ---- Post Query Result (domain-specific alias) ----

export type PostQueryResult = ValidatedRuntimeQueryResult<QucpPost>;
export type ValidatedPost = ValidatedResource<QucpPost>;

// ---- Publication Builder ----

export function buildPostPayload(input: {
  entityId: string;
  title: string;
  content: string;
  summary?: string;
  tags?: string[];
  ownerName: string;
  ownerAddress: string;
  coverMediaEntityId?: string;
  now?: number;
}): QucpPost {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-post',
    entityId: input.entityId,
    title: input.title,
    content: input.content,
    summary: input.summary ?? input.content.slice(0, 200),
    tags: input.tags ?? [],
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    coverMediaEntityId: input.coverMediaEntityId,
    createdAt: input.now ?? Date.now(),
  };
}

// ---- Query Function ----

/**
 * Execute a fully validated post query using the shared runtime.
 *
 * Steps:
 *   1. Discover all qucp-post- resources via paginated search
 *   2. Fetch each candidate resource
 *   3. Validate through postPolicy + identity resolver
 *   4. Group by entityId, establish canonical owner (first accepted publisher)
 *   5. Select latest snapshot from canonical owner
 *   6. Report completeness
 */
export async function queryPosts(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<PostQueryResult> {
  return validatedRuntimeQuery<QucpPost>(
    searchFn,
    fetchFn,
    parsePostPayload,
    postPolicy,
    identityResolver,
    {
      service: params?.service ?? 'DOCUMENT',
      identifierPrefix: params?.identifierPrefix ?? POST_SEARCH_PREFIX,
      pageSize: params?.pageSize,
      safetyMax: params?.safetyMax,
      signal: params?.signal,
    },
  );
}

// ---- Payload Parser ----

function parsePostPayload(raw: unknown): QucpPost | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.entityId !== 'string') return null;
  if (typeof d.title !== 'string') return null;
  if (typeof d.content !== 'string') return null;
  if (d.resourceFamily !== 'qucp-post') return null;
  return d as QucpPost;
}
