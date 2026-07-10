// ===== Forum RTK Query API =====
// Uses SEARCH_QDN_RESOURCES pattern (same as posts) — no central index files.

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { fetchQdnJson, requestQortium } from '../../services/qortium/qortiumClient';
import { publishJsonResource } from '../../services/qortium/qdnService';
import type { ForumCategory, ForumThread, ThreadReply, ThreadWithReplies } from '../../types/forum';

const CATEGORIES: ForumCategory[] = [
  { id: 'general', name: 'General Discussion', description: 'Community announcements and general topics', icon: '💬', sortOrder: 1, threadCount: 0, lastActivityAt: '' },
  { id: 'projects', name: 'Projects & Ideas', description: 'Propose and discuss community projects', icon: '🚀', sortOrder: 2, threadCount: 0, lastActivityAt: '' },
  { id: 'tech', name: 'Technology & Dev', description: 'Blockchain, Qortium, and development topics', icon: '⚙️', sortOrder: 3, threadCount: 0, lastActivityAt: '' },
  { id: 'governance', name: 'Governance', description: 'Polls, proposals, and community decisions', icon: '🏛️', sortOrder: 4, threadCount: 0, lastActivityAt: '' },
  { id: 'offtopic', name: 'Off-Topic', description: 'Everything else - relax and chat', icon: '🎉', sortOrder: 5, threadCount: 0, lastActivityAt: '' },
];

const QDN_SERVICE = 'DOCUMENT';

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
};

const searchAndFetch = async <T>(prefix: string): Promise<T[]> => {
  const results = await requestQortium<unknown[]>({ action: 'SEARCH_QDN_RESOURCES', service: QDN_SERVICE, identifier: prefix, prefix: true, mode: 'ALL', reverse: true, limit: 50, offset: 0 });
  if (!Array.isArray(results) || results.length === 0) return [];
  const items: T[] = [];
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const n = typeof r.name === 'string' ? r.name : '';
    const id = typeof r.identifier === 'string' ? r.identifier : '';
    if (!n || !id) continue;
    try {
      const data = await fetchQdnJson<T & { status?: string }>(QDN_SERVICE, n, id);
      if (data && typeof data === 'object' && data.status !== 'deleted') items.push(data as T);
    } catch { /* skip */ }
  }
  return items;
};

export const forumApi = createApi({
  reducerPath: 'forumApi', baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['ForumCategories', 'ForumThreads', 'ForumReplies'],
  endpoints: (builder) => ({
    getCategories: builder.query<ForumCategory[], void>({ queryFn: () => ({ data: CATEGORIES }), providesTags: ['ForumCategories'] }),
    getThreads: builder.query<ForumThread[], string>({ queryFn: (catId) => queryFn(async () => (await searchAndFetch<ForumThread>('forum-thread-')).filter(t => t.categoryId === catId)), providesTags: (_r,_e,catId) => [{ type: 'ForumThreads', id: catId }] }),
    getThread: builder.query<ThreadWithReplies, string>({ queryFn: (threadId) => queryFn(async () => { const threads = await searchAndFetch<ForumThread>('forum-thread-'); const t = threads.find(x => x.id === threadId); if (!t) throw new Error('Not found'); const replies = await searchAndFetch<ThreadReply>('forum-reply-'); return { ...t, replies: replies.filter(r => r.threadId === threadId) }; }), providesTags: (_r,_e,threadId) => [{ type: 'ForumThreads', id: threadId }, 'ForumReplies'] }),
    addReply: builder.mutation<ThreadReply, { threadId: string; content: string; authorName: string; authorAddress: string; parentReplyId?: string | null }>({ queryFn: async (input) => { try { const reply: ThreadReply = { id: 'reply-' + Date.now(), threadId: input.threadId, authorName: input.authorName, authorAddress: input.authorAddress, content: input.content, createdAt: new Date().toISOString(), parentReplyId: input.parentReplyId ?? null, likes: 0 }; await publishJsonResource({ service: 'DOCUMENT', identifier: 'forum-reply-' + reply.id, payload: reply, title: 'Reply to ' + input.threadId, filename: 'reply-' + reply.id + '.json' }); return { data: reply }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; } }, invalidatesTags: (_r,_e,{ threadId }) => [{ type: 'ForumReplies', id: threadId }] }),
    createThread: builder.mutation<ForumThread, { categoryId: string; title: string; content: string; authorName: string; authorAddress: string; tags?: string[] }>({ queryFn: async (input) => { try { const thread: ForumThread = { id: 'thread-' + Date.now(), categoryId: input.categoryId, title: input.title, content: input.content, authorName: input.authorName, authorAddress: input.authorAddress, createdAt: new Date().toISOString(), replyCount: 0, viewCount: 0, isPinned: false, isLocked: false, tags: input.tags ?? [] }; await publishJsonResource({ service: 'DOCUMENT', identifier: 'forum-thread-' + thread.id, payload: thread, title: 'Thread: ' + input.title, filename: 'thread-' + thread.id + '.json' }); return { data: thread }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; } }, invalidatesTags: (_r,_e,{ categoryId }) => [{ type: 'ForumThreads', id: categoryId }] }),
  }),
});

export const { useGetCategoriesQuery, useGetThreadsQuery, useGetThreadQuery, useAddReplyMutation, useCreateThreadMutation } = forumApi;
