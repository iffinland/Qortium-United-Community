// ===== QDN Runtime Comment Adapter =====
//
// Bridges the QDN foundation to post-comment feature APIs.
// Each comment is its own QDN resource (qucp-post-comment).
// No wrapper resources. No legacy comment-{postId}-{commentId} identifiers.

import type { QucpPostComment } from '../schemas/postCommentSchema';
import type { ValidatedRuntimeQueryResult, ValidatedResource } from './runtimeTypes';
import { validatedRuntimeQuery, type RuntimeQueryParams } from './validatedQueryRuntime';
import { postCommentPolicy } from '../policies/postCommentPolicy';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';

// ---- Discovery Prefix ----

export const COMMENT_SEARCH_PREFIX = 'qucp-post-comment-' as const;

// ---- Comment Query Result ----

export type CommentQueryResult = ValidatedRuntimeQueryResult<QucpPostComment>;
export type ValidatedComment = ValidatedResource<QucpPostComment>;

// ---- Publication Builder ----

export function buildCommentPayload(input: {
  entityId: string;
  parentEntityId: string;
  content: string;
  authorName: string;
  authorAddress: string;
  now?: number;
}): QucpPostComment {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-post-comment',
    entityId: input.entityId,
    parentEntityId: input.parentEntityId,
    content: input.content,
    ownerName: input.authorName,
    ownerAddress: input.authorAddress,
    createdAt: input.now ?? Date.now(),
  };
}

// ---- Query Function ----

/**
 * Execute a fully validated comment query.
 */
export async function queryComments(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<CommentQueryResult> {
  return validatedRuntimeQuery<QucpPostComment>(
    searchFn,
    fetchFn,
    parseCommentPayload,
    postCommentPolicy,
    identityResolver,
    {
      service: params?.service ?? 'DOCUMENT',
      identifierPrefix: params?.identifierPrefix ?? COMMENT_SEARCH_PREFIX,
      pageSize: params?.pageSize,
      safetyMax: params?.safetyMax,
      signal: params?.signal,
    },
  );
}

// ---- Payload Parser ----

function parseCommentPayload(raw: unknown): QucpPostComment | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.entityId !== 'string') return null;
  if (typeof d.parentEntityId !== 'string') return null;
  if (typeof d.content !== 'string') return null;
  if (d.resourceFamily !== 'qucp-post-comment') return null;
  return d as QucpPostComment;
}
