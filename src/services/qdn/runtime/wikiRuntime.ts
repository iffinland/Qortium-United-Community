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

// ---- Entity ID Generator ----

/**
 * Generate a full-strength collision-resistant entity ID.
 * Uses full crypto.randomUUID entropy with hyphens removed.
 */
export function generateWikiEntityId(): string {
  return `wk-${crypto.randomUUID().replaceAll('-', '')}`;
}

// ---- Slug Helper ----

const RESERVED_SLUGS = new Set(['new', 'edit', 'article']);

/**
 * Generate a URL-safe slug from a title.
 * Handles Estonian characters, reserved words, and edge cases.
 */
export function wikiSlug(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    // Transliterate common Estonian characters
    .replace(/[ä]/g, 'a')
    .replace(/[ö]/g, 'o')
    .replace(/[ü]/g, 'u')
    .replace(/[õ]/g, 'o')
    .replace(/[ž]/g, 'z')
    .replace(/[š]/g, 's')
    // Replace any remaining non-alphanumeric with hyphens
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (!normalized || RESERVED_SLUGS.has(normalized)) {
    return `article-${Date.now().toString(36)}`;
  }
  return normalized.slice(0, 100);
}

// ---- Publication Builder (Create) ----

export interface CreateWikiPayloadInput {
  entityId: string;
  categoryId: string;
  title: string;
  slug: string;
  content: string;
  summary?: string;
  tags?: string[];
  ownerName: string;
  ownerAddress: string;
  createdAt: number;
}

export function buildWikiCreatePayload(input: CreateWikiPayloadInput): QucpWikiArticle {
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
    createdAt: input.createdAt,
    revision: 1,
    status: 'active',
  };
}

// ---- Publication Builder (Update) ----

export interface UpdateWikiPayloadInput {
  existing: QucpWikiArticle;
  categoryId: string;
  title: string;
  slug: string;
  content: string;
  summary?: string;
  tags?: string[];
  ownerName: string;
  ownerAddress: string;
  expectedRevision: number;
  newStatus?: 'active' | 'archived';
}

export function buildWikiUpdatePayload(input: UpdateWikiPayloadInput): QucpWikiArticle {
  return {
    ...input.existing,
    categoryId: input.categoryId,
    title: input.title,
    slug: input.slug,
    content: input.content,
    summary: input.summary ?? input.content.slice(0, 200),
    tags: input.tags ?? [],
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    revision: input.expectedRevision + 1,
    status: input.newStatus ?? input.existing.status,
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
      adminAuthority: params?.adminAuthority,
      sharedAdminOwnership: params?.sharedAdminOwnership,
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

// ---- Exact Article Lookup ----

import { buildQucpIdentifier } from '../identifiers/qucpIdentifiers';
import { paginatedQdnSearch } from '../paginatedQdnSearch';
import { boundedFetchResources } from '../fetchQdnResources';
import { validateResource } from '../validationPipeline';
import { compareByQdnMetadata } from '../ordering/authoritativeEntityOrdering';
import type { RuntimeDiagnostic } from './runtimeTypes';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { AdminAuthorityProvider } from './runtimeTypes';

export type WikiArticleLookupStatus = 'available' | 'archived' | 'not-found' | 'malformed' | 'unavailable';

export interface WikiArticleLookupResult {
  status: WikiArticleLookupStatus;
  article: ValidatedWikiArticle | null;
  diagnostics: RuntimeDiagnostic[];
}

/**
 * Fetch and validate a single Wiki article by exact qucp-wiki-{entityId} identifier.
 * Uses identifier-specific bounded search — not full Wiki prefix discovery.
 */
export async function fetchValidatedWikiArticleByEntityId(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  entityId: string,
  adminAuthority?: AdminAuthorityProvider,
): Promise<WikiArticleLookupResult> {
  const identifier = buildQucpIdentifier('qucp-wiki', entityId);

  // Step 1: Identifier-specific search (exact, not prefix)
  try {
    const searchResult = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT',
      identifier,
      prefix: false,
      reverse: true,
      includeMetadata: true,
    });

    if (!searchResult.complete || searchResult.reason === 'request-failed') {
      return {
        status: 'unavailable',
        article: null,
        diagnostics: [{ level: 'error', code: 'wiki-article-unavailable', message: 'Wiki search infrastructure unavailable' }],
      };
    }

    if (searchResult.items.length === 0) {
      return {
        status: 'not-found',
        article: null,
        diagnostics: [{ level: 'info', code: 'wiki-article-not-found', message: `Article ${entityId} not found` }],
      };
    }

    // Step 2: Fetch only matching candidates
    const fetchResult = await boundedFetchResources(fetchFn, parseWikiPayload, searchResult.items);

    if (fetchResult.items.length === 0) {
      return { status: 'not-found', article: null, diagnostics: [{ level: 'info', code: 'wiki-article-not-found', message: `Article ${entityId} not found` }] };
    }

    // Step 3: Validate each candidate through the pipeline
    const validated: Array<{ envelope: QdnResourceEnvelope<QucpWikiArticle>; entityId: string; publisherName: string; publisherAddress: string }> = [];
    const diagnostics: RuntimeDiagnostic[] = [];

    for (const envelope of fetchResult.items) {
      const vr = await validateResource(envelope, wikiArticlePolicy, identityResolver);
      if (vr.status === 'accepted') {
        const d = vr.envelope.data as Record<string, unknown>;
        const eid = typeof d.entityId === 'string' ? d.entityId : '';
        if (eid !== entityId) {
          diagnostics.push({ level: 'warning', code: 'wiki-article-entity-mismatch', message: `Entity ID mismatch: expected ${entityId}, got ${eid}` });
          continue;
        }
        if (adminAuthority) {
          const wallet =
            vr.envelope.resolvedPublisherAddress ??
            (d.ownerAddress as string | undefined) ??
            '';
          const decision = adminAuthority({
            publisherWallet: wallet,
            mutationQdnTime: vr.envelope.metadata.updated ?? vr.envelope.metadata.created,
          });
          if (!decision.authorized) {
            diagnostics.push({
              level: 'warning',
              code: decision.reason ?? 'wiki-article-unauthorized',
              message: decision.detail ?? `Admin authority failed for wiki article ${entityId}`,
              entityId,
              publisherName: vr.envelope.metadata.name,
            });
            continue;
          }
        }
        validated.push({
          envelope: vr.envelope,
          entityId: eid,
          publisherName: vr.envelope.metadata.name,
          publisherAddress: vr.envelope.resolvedPublisherAddress ?? (d.ownerAddress as string) ?? '',
        });
      }
    }

    if (validated.length === 0) {
      return { status: 'malformed', article: null, diagnostics: [...diagnostics, { level: 'warning', code: 'wiki-article-malformed', message: 'All candidates failed validation' }] };
    }

    // Step 4: Canonical selection is the latest authorized mutation.
    // Wiki articles are Admin-managed shared state, so a currently-authorized
    // Admin may supersede a previously-published version regardless of who
    // originally created it.
    const latest = validated.reduce((best, current) =>
      compareByQdnMetadata(current.envelope, best.envelope) < 0 ? current : best
    );

    const viewStatus = (latest.envelope.data as Record<string, unknown>).status;
    return {
      status: viewStatus === 'archived' ? 'archived' : 'available',
      article: latest,
      diagnostics,
    };
  } catch {
    return { status: 'unavailable', article: null, diagnostics: [{ level: 'error', code: 'wiki-article-unavailable', message: 'Wiki article lookup failed' }] };
  }
}
