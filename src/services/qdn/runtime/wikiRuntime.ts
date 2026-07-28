// ===== QDN Runtime Wiki Adapter =====
//
// Bridges the QDN foundation to wiki feature APIs.
// Uses qucp-wiki- discovery with publisher-aware validation.

import type { QucpWikiArticle } from '../schemas/wikiArticleSchema';
import type { ValidatedRuntimeQueryResult, ValidatedResource } from './runtimeTypes';
import { validatedRuntimeQuery, type RuntimeQueryParams } from './validatedQueryRuntime';
import { wikiArticlePolicy } from '../policies/wikiArticlePolicy';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';

// ---- Discovery Prefix ----

export const WIKI_SEARCH_PREFIX = 'qucp-wiki-' as const;

// ---- Wiki Query Result ----

export type WikiQueryResult = ValidatedRuntimeQueryResult<QucpWikiArticle>;
export type ValidatedWikiArticle = ValidatedResource<QucpWikiArticle>;

// ---- Publication Builder ----

export function buildWikiPayload(input: {
  entityId: string;
  categoryId: string;
  title: string;
  slug: string;
  content: string;
  summary?: string;
  tags?: string[];
  ownerName: string;
  ownerAddress: string;
  now?: number;
}): QucpWikiArticle {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-wiki',
    entityId: input.entityId,
    categoryId: input.categoryId,
    title: input.title,
    slug: input.slug,
    content: input.content,
    summary: input.summary ?? input.content.slice(0, 200),
    tags: input.tags ?? [],
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    createdAt: input.now ?? Date.now(),
  };
}

// ---- Query Function ----

/**
 * Execute a fully validated wiki query using the shared runtime.
 */
export async function queryWikiArticles(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<WikiQueryResult> {
  return validatedRuntimeQuery<QucpWikiArticle>(
    searchFn,
    fetchFn,
    parseWikiPayload,
    wikiArticlePolicy,
    identityResolver,
    {
      service: params?.service ?? 'DOCUMENT',
      identifierPrefix: params?.identifierPrefix ?? WIKI_SEARCH_PREFIX,
      pageSize: params?.pageSize,
      safetyMax: params?.safetyMax,
      signal: params?.signal,
    },
  );
}

// ---- Payload Parser ----

function parseWikiPayload(raw: unknown): QucpWikiArticle | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.entityId !== 'string') return null;
  if (typeof d.title !== 'string') return null;
  if (typeof d.content !== 'string') return null;
  if (d.resourceFamily !== 'qucp-wiki') return null;
  return d as QucpWikiArticle;
}
