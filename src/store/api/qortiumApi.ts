// ===== RTK Query – Qortium API =====
//
// Posts and comments now use the publisher-aware validated QDN runtime.
// Polls, fund, and roles remain on legacy paths (out of scope for this phase).
//
// QDN resource identifiers (migrated domains):
//   Posts:    qucp-post-{entityId}
//   Comments: qucp-post-comment-{entityId}
//   Projects: qucp-project-{entityId} (in projectApi)
//
// Legacy identifiers (not yet migrated):
//   Polls:    poll-

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import {
  requestQortium,
  getOwnerName,
} from '../../services/qortium/qortiumClient';
import { publishJsonResource } from '../../services/qortium/qdnService';
import type { Post, Poll, FundTransaction, Comment, PostWithComments, RoleRegistry } from '../../types';
import { fetchRoleRegistry, publishRoleRegistry } from '../../services/qortium/rolesService';
import {
  fetchValidatedPosts,
  fetchValidatedComments,
  fetchValidatedTombstones,
  getTombstoneComposition,
  buildCommentPayload,
  buildTombstonePayload,
  fetchMediaReference,
  toResolvedMediaView,
} from '../../services/qdn/runtime/qdnRuntimeService';
import { buildQucpIdentifier } from '../../services/qdn/identifiers/qucpIdentifiers';
import { buildOwnerTombstoneIdentifier } from '../../services/qdn/identifiers/operationIdentifiers';
import type { TargetOwnerInfo } from '../../services/qdn/operations/ownerTombstoneReducer';

// ---- QDN Identifiers ----
const QDN_SERVICE = 'DOCUMENT';

// ---- Fund address ----
const FUND_ADDRESS =
  import.meta.env.VITE_FUND_ADDRESS ||
  'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

// ---- Helpers ----

/** Simple wrapper: call realFn, return { data } or { error }. */
const queryFn = async <T>(realFn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await realFn() }; }
  catch (err) { return { error: err instanceof Error ? err.message : 'Request failed.' }; }
};

/** Convert a validated QDN post envelope to the UI Post type. */
function toPostView(env: { envelope: { data: Record<string, unknown>; metadata: { name: string; created?: number; updated?: number } }; entityId: string; publisherName: string; publisherAddress: string }): Post {
  const d = env.envelope.data;
  const meta = env.envelope.metadata;
  return {
    id: env.entityId,
    title: (d.title as string) ?? '',
    content: (d.content as string) ?? '',
    authorName: env.publisherName,
    authorAddress: env.publisherAddress,
    createdAt: meta.created ? new Date(meta.created).toISOString() : new Date().toISOString(),
    updatedAt: meta.updated ? new Date(meta.updated).toISOString() : null,
    commentsCount: 0,
    likesCount: 0,
    isPinned: false,
    tags: Array.isArray(d.tags) ? d.tags as string[] : [],
    coverMediaEntityId: (d.coverMediaEntityId as string) ?? undefined,
    status: 'active',
  };
}

/** Convert a validated QDN comment envelope to the UI Comment type. */
function toCommentView(env: { envelope: { data: Record<string, unknown>; metadata: { name: string; created?: number } }; entityId: string; publisherName: string; publisherAddress: string }): Comment {
  const d = env.envelope.data;
  return {
    id: env.entityId,
    postId: (d.parentEntityId as string) ?? '',
    authorName: env.publisherName,
    authorAddress: env.publisherAddress,
    content: (d.content as string) ?? '',
    createdAt: env.envelope.metadata.created
      ? new Date(env.envelope.metadata.created).toISOString()
      : new Date().toISOString(),
    parentCommentId: null,
  };
}

// ---- API Definition ----

export const qortiumApi = createApi({
  reducerPath: 'qortiumApi',
  baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['Posts', 'Polls', 'FundBalance', 'FundTransactions', 'Comments', 'SinglePost', 'RoleRegistry'],
  endpoints: (builder) => ({

    // ===== POSTS (migrated — validated runtime + tombstones + media resolution) =====
    getPosts: builder.query<Post[], void>({
      queryFn: () => queryFn(async () => {
        const [postResult] = await Promise.all([
          fetchValidatedPosts(),
          fetchValidatedTombstones(),
        ]);
        if (postResult.status === 'unavailable') {
          throw new Error(postResult.reason);
        }
        const composition = getTombstoneComposition();
        const posts: Post[] = [];
        for (const p of postResult.items) {
          // Apply tombstone state
          const targetOwner: TargetOwnerInfo = {
            ownerName: p.publisherName,
            ownerAddress: p.publisherAddress,
            entityId: p.entityId,
            resourceFamily: 'qucp-post',
          };
          const tombstoneState = composition?.getEffectiveState('qucp-post', p.entityId, targetOwner);
          const isDeleted = tombstoneState?.state === 'deleted-by-owner';

          const post = toPostView(p);
          if (isDeleted) continue;

          // Resolve media reference through full validated chain
          const coverMediaId = (p.envelope.data as Record<string, unknown>).coverMediaEntityId as string | undefined;
          if (coverMediaId) {
            const resolution = await fetchMediaReference(coverMediaId);
            const view = toResolvedMediaView(resolution, isDeleted);
            if (view.status === 'resolved') {
              post.coverMediaUrl = `qdn://${view.service}/${view.publisherName}/${view.identifier}`;
            }
          }
          posts.push(post);
        }
        return posts;
      }),
      providesTags: ['Posts'],
    }),

    // ===== POLLS (not yet migrated) =====
    getPolls: builder.query<Poll[], void>({
      queryFn: () => queryFn(async () => {
        const results = await requestQortium<unknown[]>({
          action: 'SEARCH_QDN_RESOURCES',
          service: QDN_SERVICE,
          identifier: 'poll-',
          prefix: true,
          mode: 'ALL',
          reverse: true,
          limit: 50,
          offset: 0,
        });
        if (!Array.isArray(results) || results.length === 0) return [];
        const items: Poll[] = [];
        for (const item of results) {
          if (!item || typeof item !== 'object') continue;
          const r = item as Record<string, unknown>;
          const n = typeof r.name === 'string' ? r.name : '';
          const id = typeof r.identifier === 'string' ? r.identifier : '';
          if (!n || !id) continue;
          try {
            const data = await requestQortium<unknown>({
              action: 'FETCH_QDN_RESOURCE',
              service: QDN_SERVICE, name: n, identifier: id,
            });
            if (data && typeof data === 'object') {
              items.push(data as Poll);
            }
          } catch { /* skip */ }
        }
        return items;
      }),
      providesTags: ['Polls'],
    }),

    // ===== FUND BALANCE (unchanged) =====
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

    // ===== FUND TRANSACTIONS (unchanged) =====
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

    // ===== SINGLE POST (migrated — validated runtime) =====
    getPost: builder.query<PostWithComments, string>({
      queryFn: (postId) => queryFn(async () => {
        const result = await fetchValidatedPosts();
        if (result.status === 'unavailable') throw new Error(result.reason);
        const found = result.items.find((p) => p.entityId === postId);
        if (!found) throw new Error(`Post ${postId} not found.`);

        const post = toPostView(found);

        // Fetch comments for this post from validated runtime
        const commentResult = await fetchValidatedComments();
        const comments: Comment[] = [];
        if (commentResult.status !== 'unavailable') {
          for (const c of commentResult.items) {
            const d = c.envelope.data as Record<string, unknown>;
            if (d.parentEntityId === postId) {
              comments.push(toCommentView(c));
            }
          }
        }

        return { ...post, comments };
      }),
      providesTags: (_r, _e, postId) => [{ type: 'SinglePost', id: postId }],
    }),

    // ===== COMMENTS (migrated — validated runtime) =====
    getComments: builder.query<Comment[], string>({
      queryFn: (postId) => queryFn(async () => {
        const result = await fetchValidatedComments();
        if (result.status === 'unavailable') throw new Error(result.reason);
        return result.items
          .filter((c) => {
            const d = c.envelope.data as Record<string, unknown>;
            return d.parentEntityId === postId;
          })
          .map(toCommentView);
      }),
      providesTags: (_r, _e, postId) => [{ type: 'Comments', id: postId }],
    }),

    // ===== ADD COMMENT (migrated — new identifier) =====
    addComment: builder.mutation<
      Comment,
      { postId: string; content: string; authorName: string; authorAddress: string; parentCommentId?: string | null }
    >({
      queryFn: async (input) => {
        try {
          const entityId = `pc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const payload = buildCommentPayload({
            entityId,
            parentEntityId: input.postId,
            content: input.content,
            authorName: input.authorName,
            authorAddress: input.authorAddress,
          });

          const identifier = buildQucpIdentifier('qucp-post-comment', entityId);
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: `Comment by ${input.authorName}`,
            description: input.content.slice(0, 200),
            filename: `${entityId}.json`,
          });

          const comment: Comment = {
            id: entityId,
            postId: input.postId,
            authorName: input.authorName,
            authorAddress: input.authorAddress,
            content: input.content,
            createdAt: new Date().toISOString(),
            parentCommentId: input.parentCommentId ?? null,
          };
          return { data: comment };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to publish comment.' };
        }
      },
      invalidatesTags: (_r, _e, { postId }) => [{ type: 'Comments', id: postId }, { type: 'SinglePost', id: postId }, 'Posts'],
    }),

    // ===== VOTE ON POLL (not yet migrated) =====
    votePoll: builder.mutation<Poll, { pollId: string; optionIds: string[]; voterAddress: string }>({
      queryFn: async (input) => {
        try {
          await publishJsonResource({
            service: 'DOCUMENT', identifier: `vote-${input.pollId}-${input.voterAddress}`,
            payload: { pollId: input.pollId, optionIds: input.optionIds, voter: input.voterAddress, votedAt: new Date().toISOString() },
            title: `Vote on ${input.pollId}`, filename: `vote-${input.pollId}.json`,
          });
          const name = await getOwnerName();
          const data = await requestQortium<unknown>({
            action: 'FETCH_QDN_RESOURCE',
            service: QDN_SERVICE, name, identifier: `poll-${input.pollId}`,
          });
          if (data && typeof data === 'object' && 'question' in (data as Record<string, unknown>)) {
            return { data: data as Poll };
          }
          throw new Error('Poll not found after voting.');
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to submit vote.' };
        }
      },
      invalidatesTags: (_r, _e, { pollId }) => [{ type: 'Polls' }, { type: 'SinglePost', id: pollId }],
    }),

    // ===== PUBLISH RESOURCE (migrated for posts, legacy for others) =====
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
      invalidatesTags: ['Posts', 'Polls'],
    }),

    // ===== ROLE REGISTRY (unchanged) =====
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

    // ===== DELETE POST (owner tombstone operation) =====
    deletePost: builder.mutation<void, { postId: string; ownerName: string; ownerAddress: string }>({
      queryFn: async (input) => {
        try {
          const tombstoneId = `ot-${input.postId}-${Date.now()}`;
          const identifier = await buildOwnerTombstoneIdentifier(
            'qucp-post', input.postId, input.ownerAddress,
          );
          const payload = buildTombstonePayload({
            operationId: tombstoneId,
            targetFamily: 'qucp-post',
            targetEntityId: input.postId,
            ownerName: input.ownerName,
            ownerAddress: input.ownerAddress,
            action: 'delete',
          });
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: `Tombstone: ${input.postId}`,
            filename: `${tombstoneId}.json`,
          });
          return { data: undefined };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to delete post.' };
        }
      },
      invalidatesTags: ['Posts', 'SinglePost'],
    }),

    // ===== RESTORE POST (owner tombstone operation) =====
    restorePost: builder.mutation<void, { postId: string; ownerName: string; ownerAddress: string }>({
      queryFn: async (input) => {
        try {
          const tombstoneId = `ot-${input.postId}-${Date.now()}`;
          const identifier = await buildOwnerTombstoneIdentifier(
            'qucp-post', input.postId, input.ownerAddress,
          );
          const payload = buildTombstonePayload({
            operationId: tombstoneId,
            targetFamily: 'qucp-post',
            targetEntityId: input.postId,
            ownerName: input.ownerName,
            ownerAddress: input.ownerAddress,
            action: 'restore',
          });
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: `Restore: ${input.postId}`,
            filename: `${tombstoneId}.json`,
          });
          return { data: undefined };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to restore post.' };
        }
      },
      invalidatesTags: ['Posts', 'SinglePost'],
    }),
  }),
});

export const {
  useGetPostsQuery,
  useGetPollsQuery,
  useGetFundBalanceQuery,
  useGetFundTransactionsQuery,
  useGetPostQuery,
  useGetCommentsQuery,
  useAddCommentMutation,
  useVotePollMutation,
  usePublishResourceMutation,
  useGetRoleRegistryQuery,
  useUpdateRoleRegistryMutation,
  useDeletePostMutation,
  useRestorePostMutation,
} = qortiumApi;
