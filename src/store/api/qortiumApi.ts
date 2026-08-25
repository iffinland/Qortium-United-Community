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
import type { Post, Poll, Comment, PostWithComments } from '../../types';
import {
  fetchValidatedPosts,
  fetchValidatedComments,
  fetchValidatedTombstones,
  getTombstoneComposition,
  buildPostPayload,
  buildCommentPayload,
  buildTombstonePayload,
  fetchContentImageRef,
} from '../../services/qdn/runtime/qdnRuntimeService';
import { buildQucpIdentifier } from '../../services/qdn/identifiers/qucpIdentifiers';
import { buildOwnerTombstoneIdentifier } from '../../services/qdn/identifiers/operationIdentifiers';
import type { TargetOwnerInfo } from '../../services/qdn/operations/ownerTombstoneReducer';

// ---- QDN Identifiers ----
const QDN_SERVICE = 'DOCUMENT';

// ---- Helpers ----

/** Simple wrapper: call realFn, return { data } or { error }. */
const queryFn = async <T>(realFn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await realFn() }; }
  catch (err) { return { error: err instanceof Error ? err.message : 'Request failed.' }; }
};

/** Convert a validated QDN post envelope to the UI Post type. */
export function toPostView(env: { envelope: { data: Record<string, unknown>; metadata: { name: string; created?: number; updated?: number } }; entityId: string; publisherName: string; publisherAddress: string }): Post {
  const d = env.envelope.data;
  const meta = env.envelope.metadata;
  return {
    id: env.entityId,
    title: (d.title as string) ?? '',
    content: (d.content as string) ?? '',
    authorName: env.publisherName,
    authorAddress: env.publisherAddress,
    createdAt: meta.created ? new Date(meta.created).toISOString() : null,
    createdAtMs: meta.created ?? null,
    updatedAt: meta.updated ? new Date(meta.updated).toISOString() : null,
    isPinned: false,
    tags: Array.isArray(d.tags) ? d.tags as string[] : [],
    coverMediaEntityId: (d.coverMediaEntityId as string) ?? undefined,
    status: 'active',
  };
}

/** Convert a validated QDN comment envelope to the UI Comment type. */
export function toCommentView(env: { envelope: { data: Record<string, unknown>; metadata: { name: string; created?: number } }; entityId: string; publisherName: string; publisherAddress: string }): Comment {
  const d = env.envelope.data;
  return {
    id: env.entityId,
    postId: (d.parentEntityId as string) ?? '',
    authorName: env.publisherName,
    authorAddress: env.publisherAddress,
    content: (d.content as string) ?? '',
    createdAt: env.envelope.metadata.created
      ? new Date(env.envelope.metadata.created).toISOString()
      : null,
    parentCommentId: null,
  };
}

// ---- API Definition ----

export const qortiumApi = createApi({
  reducerPath: 'qortiumApi',
  baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['Posts', 'Polls', 'Comments', 'SinglePost'],
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

          // Resolve a render-safe image reference from inline rich content or
          // from a legacy qucp-media-reference for older resources.
          const postData = p.envelope.data as Record<string, unknown>;
          post.coverImageRef =
            (await fetchContentImageRef(
              typeof postData.content === 'string' ? postData.content : '',
              typeof postData.coverMediaEntityId === 'string'
                ? postData.coverMediaEntityId
                : undefined,
            )) ?? undefined;
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

    // ===== SINGLE POST (migrated — validated runtime) =====
    getPost: builder.query<PostWithComments, string>({
      queryFn: (postId) => queryFn(async () => {
        const result = await fetchValidatedPosts();
        if (result.status === 'unavailable') throw new Error(result.reason);
        const found = result.items.find((p) => p.entityId === postId);
        if (!found) throw new Error(`Post ${postId} not found.`);

        const post = toPostView(found);

        const postData = found.envelope.data as Record<string, unknown>;
        post.coverImageRef =
          (await fetchContentImageRef(
            typeof postData.content === 'string' ? postData.content : '',
            typeof postData.coverMediaEntityId === 'string'
              ? postData.coverMediaEntityId
              : undefined,
          )) ?? undefined;

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

    // ===== PUBLISH POST (canonical schema + identifier + publication) =====
    publishPost: builder.mutation<
      { success: boolean },
      {
        entityId: string;
        title: string;
        content: string;
        summary?: string;
        tags?: string[];
        coverMediaEntityId?: string;
        ownerName: string;
        ownerAddress: string;
        createdAt?: number;
      }
    >({
      queryFn: async (input) => {
        try {
          if (!input.ownerName || !input.ownerAddress) {
            throw new Error('Publisher identity is required to publish a post.');
          }
          const coverMediaEntityId = input.coverMediaEntityId;

          const payload = buildPostPayload({
            entityId: input.entityId,
            title: input.title,
            content: input.content,
            summary: input.summary,
            tags: input.tags,
            ownerName: input.ownerName,
            ownerAddress: input.ownerAddress,
            coverMediaEntityId,
            now: input.createdAt,
          });
          const identifier = buildQucpIdentifier('qucp-post', input.entityId);
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: `Post: ${input.title}`,
            description: input.summary ?? input.content.slice(0, 200),
            filename: `${input.entityId}.json`,
          });
          return { data: { success: true } };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to publish post.' };
        }
      },
      invalidatesTags: ['Posts', 'SinglePost'],
    }),

    // ===== DELETE POST (owner tombstone operation) =====
    deletePost: builder.mutation<void, { postId: string; ownerName: string; ownerAddress: string }>({
      queryFn: async (input) => {
        try {
          if (!input.ownerAddress) {
            throw new Error('Post owner identity is required to delete a post.');
          }
          const rawAccount = await requestQortium<unknown>({
            action: 'GET_SELECTED_ACCOUNT',
          });
          const account = rawAccount as Record<string, unknown>;
          const currentAddress = typeof account.address === 'string' ? account.address : '';
          if (!currentAddress || currentAddress !== input.ownerAddress) {
            throw new Error('You can only delete posts you published.');
          }

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
          if (!input.ownerAddress) {
            throw new Error('Post owner identity is required to restore a post.');
          }
          const rawAccount = await requestQortium<unknown>({
            action: 'GET_SELECTED_ACCOUNT',
          });
          const account = rawAccount as Record<string, unknown>;
          const currentAddress = typeof account.address === 'string' ? account.address : '';
          if (!currentAddress || currentAddress !== input.ownerAddress) {
            throw new Error('You can only restore posts you published.');
          }

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
  useGetPostQuery,
  useGetCommentsQuery,
  useAddCommentMutation,
  useVotePollMutation,
  usePublishPostMutation,
  useDeletePostMutation,
  useRestorePostMutation,
} = qortiumApi;
