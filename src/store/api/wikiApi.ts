// ===== Wiki RTK Query API =====
// Uses SEARCH_QDN_RESOURCES pattern. Categories are static.

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { fetchQdnJson, requestQortium } from '../../services/qortium/qortiumClient';
import { publishJsonResource } from '../../services/qortium/qdnService';
import type { WikiCategory, WikiArticle } from '../../types/wiki';

const CATEGORIES: WikiCategory[] = [
  { id: 'getting-started', name: 'Getting Started', icon: '🚀', description: 'New to Qortium? Start here.', sortOrder: 1 },
  { id: 'guides', name: 'Guides & Tutorials', icon: '📖', description: 'Step-by-step tutorials.', sortOrder: 2 },
  { id: 'governance', name: 'Governance', icon: '🏛️', description: 'Community rules and processes.', sortOrder: 3 },
  { id: 'dev', name: 'Developer Docs', icon: '⚙️', description: 'API reference and technical docs.', sortOrder: 4 },
  { id: 'faq', name: 'FAQ', icon: '❓', description: 'Frequently asked questions.', sortOrder: 5 },
];

const QDN_SERVICE = 'DOCUMENT';

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
};

export const wikiApi = createApi({
  reducerPath: 'wikiApi', baseQuery: fakeBaseQuery<string>(), tagTypes: ['WikiCategories', 'WikiArticles'],
  endpoints: (builder) => ({
    getCategories: builder.query<WikiCategory[], void>({ queryFn: () => ({ data: CATEGORIES }), providesTags: ['WikiCategories'] }),
    getArticles: builder.query<WikiArticle[], string | void>({ queryFn: (catId) => queryFn(async () => { const results = await requestQortium<unknown[]>({ action: 'SEARCH_QDN_RESOURCES', service: QDN_SERVICE, identifier: 'wiki-', prefix: true, mode: 'ALL', reverse: true, limit: 50 }); if (!Array.isArray(results)) return []; const articles: WikiArticle[] = []; for (const item of results) { if (!item || typeof item !== 'object') continue; const r = item as Record<string,unknown>; const n = typeof r.name === 'string' ? r.name : ''; const id = typeof r.identifier === 'string' ? r.identifier : ''; if (!n || !id) continue; try { const a = await fetchQdnJson<WikiArticle>(QDN_SERVICE, n, id); if (a && typeof a === 'object' && a.slug) { if (!catId || a.categoryId === catId) articles.push(a); } } catch { /* skip */ } } return articles; }), providesTags: ['WikiArticles'] }),
    getArticle: builder.query<WikiArticle, string>({ queryFn: (slug) => queryFn(async () => { const results = await requestQortium<unknown[]>({ action: 'SEARCH_QDN_RESOURCES', service: QDN_SERVICE, identifier: 'wiki-' + slug, prefix: false, limit: 5 }); if (!Array.isArray(results) || results.length === 0) throw new Error('Not found'); const r = results[0] as Record<string,unknown>; const n = typeof r.name === 'string' ? r.name : ''; const id = typeof r.identifier === 'string' ? r.identifier : ''; const a = await fetchQdnJson<WikiArticle>(QDN_SERVICE, n, id); if (!a?.slug) throw new Error('Not found'); return a; }), providesTags: (_r,_e,slug) => [{ type: 'WikiArticles', id: slug }] }),
    saveArticle: builder.mutation<WikiArticle, { slug?: string; categoryId: string; title: string; content: string; authorName: string }>({ queryFn: async (input) => { try { const article: WikiArticle = { id: 'wa-' + Date.now(), categoryId: input.categoryId, title: input.title, slug: input.slug || input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), content: input.content, authorName: input.authorName, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() }; await publishJsonResource({ service: 'DOCUMENT', identifier: 'wiki-' + article.slug, payload: article, title: article.title, filename: 'wiki-' + article.slug + '.json' }); return { data: article }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; } }, invalidatesTags: ['WikiArticles'] }),
  }),
});

export const { useGetCategoriesQuery, useGetArticlesQuery, useGetArticleQuery, useSaveArticleMutation } = wikiApi;
