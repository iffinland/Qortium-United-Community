// ===== Wiki RTK Query API =====
//
// Canonical QDN-backed Wiki domain.
// Articles use qucp-wiki- identifiers with stable entity IDs.
// Categories remain static application taxonomy.

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { publishJsonResource } from '../../services/qortium/qdnService';
import type { WikiCategory, WikiArticleView, WikiListResult, WikiDetailResult, WikiSaveResult } from '../../types/wiki';
import {
  fetchValidatedWiki,
  buildWikiCreatePayload,
  buildWikiUpdatePayload,
  generateWikiEntityId,
  wikiSlug,
  fetchValidatedWikiArticleByEntityId,
} from '../../services/qdn/runtime/qdnRuntimeService';
import { buildQucpIdentifier } from '../../services/qdn/identifiers/qucpIdentifiers';
import type { QucpWikiArticle } from '../../services/qdn/schemas/wikiArticleSchema';

// ---- Static Categories ----

const CATEGORIES: WikiCategory[] = [
  { id: 'getting-started', name: 'Getting Started', icon: '🚀', description: 'New to Qortium? Start here.', sortOrder: 1 },
  { id: 'guides', name: 'Guides & Tutorials', icon: '📖', description: 'Step-by-step tutorials.', sortOrder: 2 },
  { id: 'governance', name: 'Governance', icon: '🏛️', description: 'Community rules and processes.', sortOrder: 3 },
  { id: 'dev', name: 'Developer Docs', icon: '⚙️', description: 'API reference and technical docs.', sortOrder: 4 },
  { id: 'faq', name: 'FAQ', icon: '❓', description: 'Frequently asked questions.', sortOrder: 5 },
];

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
};

// ---- Projection ----

function toWikiView(
  env: { envelope: { data: Record<string, unknown>; metadata: { name: string; created?: number; updated?: number } }; entityId: string; publisherName: string; publisherAddress: string },
): WikiArticleView {
  const d = env.envelope.data;
  const meta = env.envelope.metadata;
  const identifier = buildQucpIdentifier('qucp-wiki', env.entityId);
  return {
    entityId: env.entityId,
    identifier,
    categoryId: (d.categoryId as string) ?? 'unknown',
    title: (d.title as string) ?? '',
    slug: (d.slug as string) ?? '',
    content: (d.content as string) ?? '',
    summary: (d.summary as string) ?? '',
    tags: (d.tags as string[]) ?? [],
    publisherName: env.publisherName,
    publisherAddress: env.publisherAddress,
    createdAt: meta.created ? new Date(meta.created).toISOString() : null,
    updatedAt: meta.updated ? new Date(meta.updated).toISOString() : null,
    revision: typeof d.revision === 'number' ? d.revision : 1,
    status: (d.status === 'archived' ? 'archived' : 'active') as WikiArticleView['status'],
  };
}

// ---- Publisher Identity ----

import { store as appStore } from '../../store';

const WIKI_EDITOR_ROLES_API = new Set(['SysOp', 'Admin']);

interface PublisherIdentity {
  name: string;
  address: string;
  role: string;
}

function resolvePublisherIdentity(): PublisherIdentity | null {
  const state = appStore.getState();
  const name = state.auth?.name as string | null;
  const address = state.auth?.address as string | null;
  const role = state.auth?.role as string ?? 'User';
  if (!name || !address) return null;
  return { name, address, role };
}

function assertAuthorized(identity: PublisherIdentity | null, operation: string): { error?: string } {
  if (!identity) return { error: 'Publisher identity not available.' };
  if (!WIKI_EDITOR_ROLES_API.has(identity.role)) {
    return { error: `Role "${identity.role}" not authorized to ${operation} wiki articles.` };
  }
  return {};
}

// ---- API ----

export const wikiApi = createApi({
  reducerPath: 'wikiApi', baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['WikiCategories', 'WikiArticle', 'WikiList'],
  endpoints: (builder) => ({

    // ===== GET CATEGORIES =====
    getCategories: builder.query<WikiCategory[], void>({
      queryFn: () => ({ data: CATEGORIES }),
      providesTags: ['WikiCategories'],
    }),

    // ===== GET WIKI LIST =====
    getWikiList: builder.query<WikiListResult, string | void>({
      queryFn: (catId) => queryFn(async () => {
        const result = await fetchValidatedWiki();

        if (result.status === 'unavailable') {
          return { status: 'unavailable' as const, articles: [], diagnostics: [result.reason] };
        }

        const allArticles = result.items.map(toWikiView);
        const activeArticles = allArticles.filter((a) => a.status === 'active');
        const filtered = (catId && typeof catId === 'string')
          ? activeArticles.filter((a) => a.categoryId === catId)
          : activeArticles;

        // Sort: updatedAt desc, title asc, entityId asc
        const sorted = [...filtered].sort((a, b) => {
          const ua = a.updatedAt ?? '';
          const ub = b.updatedAt ?? '';
          if (ua !== ub) return ua > ub ? -1 : 1;
          const tc = a.title.localeCompare(b.title);
          if (tc !== 0) return tc;
          return a.entityId.localeCompare(b.entityId);
        });

        const diags = result.status === 'incomplete'
          ? result.diagnostics?.map((d) => d.message) ?? ['Incomplete results']
          : [];

        return {
          status: result.status === 'empty' ? 'empty' : result.status === 'incomplete' ? 'incomplete' : 'complete',
          articles: sorted,
          diagnostics: diags,
        } as WikiListResult;
      }),
      providesTags: (result) =>
        result?.articles
          ? [{ type: 'WikiList' as const, id: 'ALL' }, ...result.articles.map((a) => ({ type: 'WikiArticle' as const, id: a.entityId }))]
          : [{ type: 'WikiList' as const, id: 'ALL' }],
    }),

    // ===== GET WIKI ADMIN LIST (active + archived) =====
    getWikiAdminList: builder.query<WikiListResult, void>({
      queryFn: () => queryFn(async () => {
        const result = await fetchValidatedWiki();

        if (result.status === 'unavailable') {
          return { status: 'unavailable' as const, articles: [], diagnostics: [result.reason] };
        }

        const allArticles = result.items.map(toWikiView);

        // Sort: updatedAt desc, title asc, entityId asc
        const sorted = [...allArticles].sort((a, b) => {
          const ua = a.updatedAt ?? '';
          const ub = b.updatedAt ?? '';
          if (ua !== ub) return ua > ub ? -1 : 1;
          const tc = a.title.localeCompare(b.title);
          if (tc !== 0) return tc;
          return a.entityId.localeCompare(b.entityId);
        });

        const diags = result.status === 'incomplete'
          ? result.diagnostics?.map((d) => d.message) ?? ['Incomplete results']
          : [];

        return {
          status: result.status === 'empty' ? 'empty' : result.status === 'incomplete' ? 'incomplete' : 'complete',
          articles: sorted,
          diagnostics: diags,
        } as WikiListResult;
      }),
      providesTags: (result) =>
        result?.articles
          ? [{ type: 'WikiList' as const, id: 'ALL' }, ...result.articles.map((a) => ({ type: 'WikiArticle' as const, id: a.entityId }))]
          : [{ type: 'WikiList' as const, id: 'ALL' }],
    }),

    // ===== GET WIKI ARTICLE (exact lookup by entity ID) =====
    getWikiArticle: builder.query<WikiDetailResult, string>({
      queryFn: (entityId) => queryFn(async () => {
        const result = await fetchValidatedWikiArticleByEntityId(entityId);
        if (result.status === 'unavailable') {
          return { status: 'unavailable' as const, article: null, diagnostics: result.diagnostics.map(d => d.message) } as WikiDetailResult;
        }
        if (result.status === 'not-found') {
          return { status: 'not-found' as const, article: null, diagnostics: result.diagnostics.map(d => d.message) } as WikiDetailResult;
        }
        if (!result.article) {
          return { status: 'not-found' as const, article: null, diagnostics: ['Article not found'] } as WikiDetailResult;
        }
        const view = toWikiView(result.article);
        return { status: result.status === 'archived' ? 'archived' as const : 'available' as const, article: view, diagnostics: [] } as WikiDetailResult;
      }),
      providesTags: (_r, _e, entityId) => [{ type: 'WikiArticle', id: entityId }],
    }),

    // ===== CREATE WIKI ARTICLE =====
    createWikiArticle: builder.mutation<WikiSaveResult, { categoryId: string; title: string; content: string }>({
      queryFn: async (input) => {
        try {
          const identity = resolvePublisherIdentity();
          const authErr = assertAuthorized(identity, 'create');
          if (authErr.error) return { error: authErr.error };
          const id = identity!;

          if (!CATEGORY_IDS.has(input.categoryId)) {
            return { error: `Unknown category: ${input.categoryId}` };
          }

          const entityId = generateWikiEntityId();
          const slug = wikiSlug(input.title);
          const now = Date.now();

          const payload = buildWikiCreatePayload({
            entityId,
            categoryId: input.categoryId,
            title: input.title.trim(),
            slug,
            content: input.content.trim(),
            ownerName: id.name,
            ownerAddress: id.address,
            createdAt: now,
          });

          const identifier = buildQucpIdentifier('qucp-wiki', entityId);
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: input.title,
            filename: `${entityId}.json`,
          });

          const article: WikiArticleView = {
            entityId,
            identifier,
            categoryId: input.categoryId,
            title: input.title.trim(),
            slug,
            content: input.content.trim(),
            summary: payload.summary ?? '',
            tags: payload.tags ?? [],
            publisherName: id.name,
            publisherAddress: id.address,
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
            revision: 1,
            status: 'active',
          };
          return { data: { article } };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Publication failed.' };
        }
      },
      invalidatesTags: [{ type: 'WikiList', id: 'ALL' }],
    }),

    // ===== UPDATE WIKI ARTICLE =====
    updateWikiArticle: builder.mutation<WikiSaveResult, { entityId: string; expectedRevision: number; categoryId: string; title: string; content: string }>({
      queryFn: async (input) => {
        try {
          const identity = resolvePublisherIdentity();
          const authErr = assertAuthorized(identity, 'update');
          if (authErr.error) return { error: authErr.error };
          const id = identity!;

          if (!CATEGORY_IDS.has(input.categoryId)) {
            return { error: `Unknown category: ${input.categoryId}` };
          }

          const lookupResult = await fetchValidatedWikiArticleByEntityId(input.entityId);
          if (lookupResult.status === 'unavailable') {
            return { error: 'Cannot verify article state — Wiki unavailable.' };
          }
          if (lookupResult.status === 'not-found' || !lookupResult.article) {
            return { error: `Article ${input.entityId} not found.` };
          }

          const existing = lookupResult.article.envelope.data as QucpWikiArticle;

          if (existing.revision !== input.expectedRevision) {
            return { error: `Conflict: article was modified (expected revision ${input.expectedRevision}, current ${existing.revision}).` };
          }

          const slug = wikiSlug(input.title);
          const payload = buildWikiUpdatePayload({
            existing,
            categoryId: input.categoryId,
            title: input.title.trim(),
            slug,
            content: input.content.trim(),
            ownerName: id.name,
            ownerAddress: id.address,
            expectedRevision: input.expectedRevision,
          });

          const identifier = buildQucpIdentifier('qucp-wiki', input.entityId);
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: input.title,
            filename: `${input.entityId}.json`,
          });

          return { data: { article: {
            entityId: input.entityId, identifier, categoryId: input.categoryId,
            title: input.title.trim(), slug, content: input.content.trim(),
            summary: payload.summary ?? '', tags: payload.tags ?? [],
            publisherName: id.name, publisherAddress: id.address,
            createdAt: existing.createdAt ? new Date(existing.createdAt).toISOString() : null,
            updatedAt: null, revision: existing.revision + 1,
            status: existing.status as WikiArticleView['status'],
          }}};
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Update failed.' };
        }
      },
      invalidatesTags: (_r, _e, { entityId }) => [{ type: 'WikiArticle', id: entityId }, { type: 'WikiList', id: 'ALL' }],
    }),

    // ===== ARCHIVE WIKI ARTICLE =====
    archiveWikiArticle: builder.mutation<WikiSaveResult, { entityId: string; expectedRevision: number }>({
      queryFn: async (input) => {
        try {
          const identity = resolvePublisherIdentity();
          const authErr = assertAuthorized(identity, 'archive');
          if (authErr.error) return { error: authErr.error };
          const id = identity!;

          const lookupResult = await fetchValidatedWikiArticleByEntityId(input.entityId);
          if (lookupResult.status === 'unavailable') {
            return { error: 'Cannot verify article state — Wiki unavailable.' };
          }
          if (lookupResult.status === 'not-found' || !lookupResult.article) {
            return { error: `Article ${input.entityId} not found.` };
          }

          const existing = lookupResult.article.envelope.data as QucpWikiArticle;

          if (existing.revision !== input.expectedRevision) {
            return { error: `Conflict: article was modified (expected revision ${input.expectedRevision}, current ${existing.revision}).` };
          }

          const payload = buildWikiUpdatePayload({
            existing,
            categoryId: existing.categoryId,
            title: existing.title,
            slug: existing.slug,
            content: existing.content,
            ownerName: id.name,
            ownerAddress: id.address,
            expectedRevision: input.expectedRevision,
            newStatus: 'archived',
          });

          const identifier = buildQucpIdentifier('qucp-wiki', input.entityId);
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: existing.title,
            filename: `${input.entityId}.json`,
          });

          return { data: { article: {
            entityId: input.entityId, identifier, categoryId: existing.categoryId,
            title: existing.title, slug: existing.slug, content: existing.content,
            summary: existing.summary ?? '', tags: existing.tags ?? [],
            publisherName: id.name, publisherAddress: id.address,
            createdAt: existing.createdAt ? new Date(existing.createdAt).toISOString() : null,
            updatedAt: null, revision: existing.revision + 1, status: 'archived',
          }}};
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Archive failed.' };
        }
      },
      invalidatesTags: (_r, _e, { entityId }) => [{ type: 'WikiArticle', id: entityId }, { type: 'WikiList', id: 'ALL' }],
    }),
  }),
});

export const {
  useGetCategoriesQuery,
  useGetWikiListQuery,
  useGetWikiAdminListQuery,
  useGetWikiArticleQuery,
  useCreateWikiArticleMutation,
  useUpdateWikiArticleMutation,
  useArchiveWikiArticleMutation,
} = wikiApi;
