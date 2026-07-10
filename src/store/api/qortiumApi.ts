// ===== RTK Query – Qortium API =====
//
// Real API layer using the Qortium qdnRequest bridge.
// All queries and mutations go directly to QDN — no mock data.
//
// QDN resource identifiers:
//   Posts:    DOCUMENT / <ownerName> / posts-index
//   Polls:    DOCUMENT / <ownerName> / polls-index
//   Projects: DOCUMENT / <ownerName> / projects-index

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import {
  requestQortium,
  fetchQdnJson,
  extractArray,
  getOwnerName,
} from '../../services/qortium/qortiumClient';
import { publishJsonResource } from '../../services/qortium/qdnService';
import { deleteResource } from '../../services/qortium/qdnService';
import type { Post, Poll, Project, FundTransaction, Comment, PostWithComments, RoleRegistry } from '../../types';
import { fetchRoleRegistry, publishRoleRegistry } from '../../services/qortium/rolesService';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, type Notification } from '../../services/qortium/notificationService';

// ---- QDN Identifiers ----
const QDN_SERVICE = 'DOCUMENT';

// ---- Fund address ----
const FUND_ADDRESS =
  import.meta.env.VITE_FUND_ADDRESS ||
  'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

// ---- Helpers ----

/** Resolve the current user's QDN name for reading/publishing. */
const resolveQdnName = async (): Promise<string> => getOwnerName();

/** Simple wrapper: call realFn, return { data } or { error }. */
const queryFn = async <T>(realFn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await realFn() }; }
  catch (err) { return { error: err instanceof Error ? err.message : 'Request failed.' }; }
};

/** Search QDN for resources matching an identifier prefix, fetch each one. */
const searchAndFetch = async <T>(identifierPrefix: string): Promise<T[]> => {
  const searchResults = await requestQortium<unknown[]>({
    action: 'SEARCH_QDN_RESOURCES',
    service: QDN_SERVICE,
    identifier: identifierPrefix,
    prefix: true,
    mode: 'ALL',
    reverse: true,
    limit: 50,
    offset: 0,
  });

  if (!Array.isArray(searchResults) || searchResults.length === 0) return [];

  const items: T[] = [];
  for (const item of searchResults) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const itemName = typeof r.name === 'string' ? r.name : '';
    const itemId = typeof r.identifier === 'string' ? r.identifier : '';
    if (!itemName || !itemId) continue;

    try {
      // The resource itself IS the item (post, poll, project) — not a wrapper
      const data = await fetchQdnJson<T & { status?: string }>(QDN_SERVICE, itemName, itemId);
      if (data && typeof data === 'object' && data.status !== 'deleted') {
        items.push(data as T);
      }
    } catch {
      // Skip resources that can't be fetched/parsed
    }
  }

  return items;
};

// ---- API Definition ----

export const qortiumApi = createApi({
  reducerPath: 'qortiumApi',
  baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['Posts', 'Polls', 'Projects', 'FundBalance', 'FundTransactions', 'Comments', 'SinglePost', 'RoleRegistry', 'Notifications'],
  endpoints: (builder) => ({

    // ===== POSTS =====
    getPosts: builder.query<Post[], void>({
      queryFn: () => queryFn(() => searchAndFetch<Post>('post-')),
      providesTags: ['Posts'],
    }),

    // ===== POLLS =====
    getPolls: builder.query<Poll[], void>({
      queryFn: () => queryFn(() => searchAndFetch<Poll>('poll-')),
      providesTags: ['Polls'],
    }),

    // ===== PROJECTS =====
    getProjects: builder.query<Project[], void>({
      queryFn: () => queryFn(() => searchAndFetch<Project>('proj-')),
      providesTags: ['Projects'],
    }),

    // ===== FUND BALANCE =====
    getFundBalance: builder.query<number, void>({
      queryFn: () => queryFn(async () => {
        const raw = await requestQortium<unknown>({ action: 'GET_BALANCE', address: FUND_ADDRESS });
        if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
        if (typeof raw === 'string') { const p = Number(raw); if (Number.isFinite(p)) return p; }
        if (raw && typeof raw === 'object') {
          for (const key of ['balance', 'value', 'amount', 'confirmedBalance']) {
            const val = (raw as Record<string, unknown>)[key];
            if (typeof val === 'number' && Number.isFinite(val)) return val;
            if (typeof val === 'string') { const p = Number(val); if (Number.isFinite(p)) return p; }
          }
        }
        throw new Error('Could not parse balance.');
      }),
      providesTags: ['FundBalance'],
    }),

    // ===== FUND TRANSACTIONS =====
    getFundTransactions: builder.query<FundTransaction[], void>({
      queryFn: () => queryFn(async () => {
        const raw = await requestQortium<unknown>({
          action: 'FETCH_NODE_API',
          path: `/transactions/search?address=${FUND_ADDRESS}&limit=20&reverse=true`,
          method: 'GET',
        });
        const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw;
        if (!Array.isArray(parsed)) throw new Error('No transactions found.');
        return parsed.map((tx: Record<string, unknown>, i: number): FundTransaction => ({
          id: (tx.signature as string) || (tx.txHash as string) || `tx-${i}`,
          from: (tx.creatorAddress as string) || (tx.from as string) || '',
          to: (tx.recipient as string) || (tx.to as string) || FUND_ADDRESS,
          amount: typeof tx.amount === 'number' ? tx.amount : typeof tx.fee === 'number' ? tx.fee / 1e8 : 0,
          description: (tx.description as string) || (tx.txType === 'PAYMENT' ? 'Payment' : 'Transaction'),
          timestamp: (tx.timestamp as string) || (tx.created as string) || new Date().toISOString(),
          txHash: (tx.signature as string) || (tx.txHash as string) || `tx-${i}`,
        }));
      }),
      providesTags: ['FundTransactions'],
    }),

    // ===== SINGLE POST =====
    getPost: builder.query<PostWithComments, string>({
      queryFn: (postId) => queryFn(async () => {
        const name = await resolveQdnName();
        // Fetch the specific post resource: DOCUMENT / <name> / post-<postId>
        const data = await fetchQdnJson<Post>(QDN_SERVICE, name, `post-${postId}`);
        const post = data && typeof data === 'object' && 'title' in data ? data as Post : null;
        if (!post) throw new Error(`Post ${postId} not found.`);
        // Fetch comments
        const comments = await (async () => {
          try {
            const cData = await fetchQdnJson<{ comments?: Comment[] }>(QDN_SERVICE, name, `comments-${postId}`);
            return extractArray<Comment>(cData, 'comments');
          } catch { return []; }
        })();
        return { ...post, comments };
      }),
      providesTags: (_r, _e, postId) => [{ type: 'SinglePost', id: postId }],
    }),

    // ===== COMMENTS =====
    getComments: builder.query<Comment[], string>({
      queryFn: (postId) => queryFn(async () => {
        const name = await resolveQdnName();
        const data = await fetchQdnJson<{ comments?: Comment[] }>(QDN_SERVICE, name, `comments-${postId}`);
        return extractArray<Comment>(data, 'comments');
      }),
      providesTags: (_r, _e, postId) => [{ type: 'Comments', id: postId }],
    }),

    // ===== ADD COMMENT =====
    addComment: builder.mutation<
      Comment,
      { postId: string; content: string; authorName: string; authorAddress: string; parentCommentId?: string | null }
    >({
      queryFn: async (input) => {
        try {
          const comment: Comment = {
            id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            postId: input.postId, authorName: input.authorName, authorAddress: input.authorAddress,
            content: input.content, createdAt: new Date().toISOString(), parentCommentId: input.parentCommentId ?? null,
          };
          await publishJsonResource({
            service: 'DOCUMENT', identifier: `comment-${input.postId}-${comment.id}`,
            payload: comment, title: `Comment by ${input.authorName}`,
            description: input.content.slice(0, 200), filename: `${comment.id}.json`,
          });
          return { data: comment };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to publish comment.' };
        }
      },
      invalidatesTags: (_r, _e, { postId }) => [{ type: 'Comments', id: postId }, { type: 'SinglePost', id: postId }, 'Posts'],
    }),

    // ===== VOTE ON POLL =====
    votePoll: builder.mutation<Poll, { pollId: string; optionIds: string[]; voterAddress: string }>({
      queryFn: async (input) => {
        try {
          await publishJsonResource({
            service: 'DOCUMENT', identifier: `vote-${input.pollId}-${input.voterAddress}`,
            payload: { pollId: input.pollId, optionIds: input.optionIds, voter: input.voterAddress, votedAt: new Date().toISOString() },
            title: `Vote on ${input.pollId}`, filename: `vote-${input.pollId}.json`,
          });
          const name = await resolveQdnName();
          const data = await fetchQdnJson<Poll>(QDN_SERVICE, name, `poll-${input.pollId}`);
          const updated = data && typeof data === 'object' && 'question' in data ? data as Poll : null;
          if (!updated) throw new Error('Poll not found after voting.');
          return { data: updated };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to submit vote.' };
        }
      },
      invalidatesTags: (_r, _e, { pollId }) => [{ type: 'Polls' }, { type: 'SinglePost', id: pollId }],
    }),

    // ===== PUBLISH RESOURCE =====
    publishResource: builder.mutation<
      { success: boolean; resourceId: string },
      { service: string; identifier: string; title: string; description: string; data: unknown; filename?: string }
    >({
      queryFn: async (input) => {
        try {
          await publishJsonResource({
            service: input.service, identifier: input.identifier, payload: input.data,
            title: input.title, description: input.description,
            filename: input.filename || `${input.identifier}.json`,
          });
          return { data: { success: true, resourceId: `${input.identifier}-${Date.now()}` } };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to publish resource.' };
        }
      },
      invalidatesTags: ['Posts', 'Polls', 'Projects'],
    }),

    // ===== ROLE REGISTRY =====
    getRoleRegistry: builder.query<RoleRegistry, void>({
      queryFn: () => queryFn(() => fetchRoleRegistry()),
      providesTags: ['RoleRegistry'],
    }),

    updateRoleRegistry: builder.mutation<RoleRegistry, RoleRegistry>({
      queryFn: async (input) => {
        try {
          return { data: await publishRoleRegistry(input) };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to update roles.' };
        }
      },
      invalidatesTags: ['RoleRegistry'],
    }),

    // ===== NOTIFICATIONS =====
    getNotifications: builder.query<Notification[], void>({
      queryFn: () => queryFn(() => fetchNotifications()),
      providesTags: ['Notifications'],
    }),

    markNotificationRead: builder.mutation<void, Notification>({
      queryFn: async (notif) => {
        try { await markNotificationRead(notif); return { data: undefined }; }
        catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
      },
      invalidatesTags: ['Notifications'],
    }),

    markAllNotificationsRead: builder.mutation<void, Notification[]>({
      queryFn: async (notifs) => {
        try { await markAllNotificationsRead(notifs); return { data: undefined }; }
        catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
      },
      invalidatesTags: ['Notifications'],
    }),

    // ===== DELETE POST (tombstone pattern) =====
    deletePost: builder.mutation<void, { postId: string; currentData: Record<string, unknown> }>({
      queryFn: async (input) => {
        try {
          await deleteResource({
            service: 'DOCUMENT',
            identifier: `post-${input.postId}`,
            originalPayload: input.currentData,
            title: input.currentData.title as string,
          });
          return { data: undefined };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to delete post.' };
        }
      },
      invalidatesTags: ['Posts', 'SinglePost'],
    }),
  }),
});

export const {
  useGetPostsQuery,
  useGetPollsQuery,
  useGetProjectsQuery,
  useGetFundBalanceQuery,
  useGetFundTransactionsQuery,
  useGetPostQuery,
  useGetCommentsQuery,
  useAddCommentMutation,
  useVotePollMutation,
  usePublishResourceMutation,
  useGetRoleRegistryQuery,
  useUpdateRoleRegistryMutation,
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useDeletePostMutation,
} = qortiumApi;
