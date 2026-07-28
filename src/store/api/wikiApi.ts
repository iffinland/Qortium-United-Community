// ===== Wiki RTK Query API =====
//
// Migrated to use the publisher-aware validated QDN runtime.
// Categories remain static. Articles use qucp-wiki- identifiers.

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { publishJsonResource } from '../../services/qortium/qdnService';
import type { WikiCategory, WikiArticle } from '../../types/wiki';
import {
  fetchValidatedWiki,
  buildWikiPayload,
} from '../../services/qdn/runtime/qdnRuntimeService';
import { buildQucpIdentifier } from '../../services/qdn/identifiers/qucpIdentifiers';

const CATEGORIES: WikiCategory[] = [
  { id: 'getting-started', name: 'Getting Started', icon: '🚀', description: 'New to Qortium? Start here.', sortOrder: 1 },
  { id: 'guides', name: 'Guides & Tutorials', icon: '📖', description: 'Step-by-step tutorials.', sortOrder: 2 },
  { id: 'governance', name: 'Governance', icon: '🏛️', description: 'Community rules and processes.', sortOrder: 3 },
  { id: 'dev', name: 'Developer Docs', icon: '⚙️', description: 'API reference and technical docs.', sortOrder: 4 },
  { id: 'faq', name: 'FAQ', icon: '❓', description: 'Frequently asked questions.', sortOrder: 5 },
];

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
};

/** Convert a validated QDN wiki envelope to the UI WikiArticle type. */
function toWikiView(env: { envelope: { data: Record<string, unknown>; metadata: { name: string; created?: number; updated?: number } }; entityId: string; publisherName: string }): WikiArticle {
  const d = env.envelope.data;
  const meta = env.envelope.metadata;
  return {
    id: env.entityId,
    categoryId: (d.categoryId as string) ?? '',
    title: (d.title as string) ?? '',
    slug: (d.slug as string) ?? '',
    content: (d.content as string) ?? '',
    authorName: env.publisherName,
    updatedAt: meta.updated ? new Date(meta.updated).toISOString() : new Date().toISOString(),
    createdAt: meta.created ? new Date(meta.created).toISOString() : new Date().toISOString(),
  };
}

export const wikiApi = createApi({
  reducerPath: 'wikiApi', baseQuery: fakeBaseQuery<string>(), tagTypes: ['WikiCategories', 'WikiArticles'],
  endpoints: (builder) => ({
    getCategories: builder.query<WikiCategory[], void>({ queryFn: () => ({ data: CATEGORIES }), providesTags: ['WikiCategories'] }),

    // ===== GET ARTICLES (migrated — validated runtime) =====
    getArticles: builder.query<WikiArticle[], string | void>({
      queryFn: (catId) => queryFn(async () => {
        const result = await fetchValidatedWiki();
        if (result.status === 'unavailable') throw new Error(result.reason);
        const articles = result.items.map(toWikiView);
        if (catId && typeof catId === 'string') {
          return articles.filter((a) => a.categoryId === catId);
        }
        return articles;
      }),
      providesTags: ['WikiArticles'],
    }),

    // ===== GET ARTICLE (migrated — validated runtime, resolves by slug) =====
    getArticle: builder.query<WikiArticle, string>({
      queryFn: (slug) => queryFn(async () => {
        const result = await fetchValidatedWiki();
        if (result.status === 'unavailable') throw new Error(result.reason);
        const found = result.items
          .map(toWikiView)
          .find((a) => a.slug === slug);
        if (!found) throw new Error(`Article with slug "${slug}" not found.`);
        return found;
      }),
      providesTags: (_r, _e, slug) => [{ type: 'WikiArticles', id: slug }],
    }),

    // ===== SAVE ARTICLE (migrated — new identifier) =====
    saveArticle: builder.mutation<WikiArticle, { slug?: string; categoryId: string; title: string; content: string; authorName: string; authorAddress?: string }>({
      queryFn: async (input) => {
        try {
          const entityId = `wa-${Date.now()}`;
          const slug = input.slug || input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const payload = buildWikiPayload({
            entityId,
            categoryId: input.categoryId,
            title: input.title,
            slug,
            content: input.content,
            ownerName: input.authorName,
            ownerAddress: input.authorAddress ?? '',
          });

          const identifier = buildQucpIdentifier('qucp-wiki', entityId);
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: input.title,
            filename: `${entityId}.json`,
          });

          const article: WikiArticle = {
            id: entityId,
            categoryId: input.categoryId,
            title: input.title,
            slug,
            content: input.content,
            authorName: input.authorName,
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          };
          return { data: article };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed.' };
        }
      },
      invalidatesTags: ['WikiArticles'],
    }),
  }),
});

export const { useGetCategoriesQuery, useGetArticlesQuery, useGetArticleQuery, useSaveArticleMutation } = wikiApi;
