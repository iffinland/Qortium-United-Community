// ===== Forum RTK Query API =====
//
// Migrated to the publisher-aware validated QDN runtime.
// Topics use qucp-forum-topic- identifiers. Replies use qucp-forum-reply- identifiers.
// Exposes discovery completeness and diagnostics to the UI. Rejects orphan replies.

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { publishJsonResource } from '../../services/qortium/qdnService';
import { buildQucpIdentifier } from '../../services/qdn/identifiers/qucpIdentifiers';
import {
  fetchValidatedForumTopics,
  fetchValidatedForumReplies,
  buildForumTopicPayload,
  buildForumReplyPayload,
} from '../../services/qdn/runtime/qdnRuntimeService';
import type { QueryCompleteness } from '../../services/qdn/runtime/runtimeTypes';
import { warningDiag, type QdnDiagnostic } from '../../services/qdn/diagnostics';
import type { ForumCategory, ForumThread, ThreadReply, ThreadWithReplies } from '../../types/forum';
import {
  buildActiveForumDiscussions,
  type ActiveForumDiscussion,
  type ForumDiscussionReplyInput,
  type ForumDiscussionThreadInput,
} from '../../services/dashboard/forumActivity';

// ---- Categories — current fixed Forum configuration ----

const CATEGORIES: ForumCategory[] = [
  { id: 'general', name: 'General Discussion', description: 'Community announcements and general topics', icon: '💬', sortOrder: 1, threadCount: 0, lastActivityAt: '' },
  { id: 'projects', name: 'Projects & Ideas', description: 'Propose and discuss community projects', icon: '🚀', sortOrder: 2, threadCount: 0, lastActivityAt: '' },
  { id: 'tech', name: 'Technology & Dev', description: 'Blockchain, Qortium, and development topics', icon: '⚙️', sortOrder: 3, threadCount: 0, lastActivityAt: '' },
  { id: 'governance', name: 'Governance', description: 'Polls, proposals, and community decisions', icon: '🏛️', sortOrder: 4, threadCount: 0, lastActivityAt: '' },
  { id: 'offtopic', name: 'Off-Topic', description: 'Everything else - relax and chat', icon: '🎉', sortOrder: 5, threadCount: 0, lastActivityAt: '' },
];

// ---- Parent-link diagnostic codes ----

const FORUM_DIAG = {
  REPLY_PARENT_MISSING: 'forum-reply-parent-missing',
  REPLY_PARENT_NOT_ACCEPTED: 'forum-reply-parent-not-accepted',
} as const;

// ---- Result types (completeness-exposing, diagnostics-preserving) ----

export interface ForumTopicListResult {
  topics: ForumThread[];
  completeness: QueryCompleteness;
  diagnostics: readonly QdnDiagnostic[];
}

export interface ForumThreadResult {
  thread: ThreadWithReplies;
  completeness: QueryCompleteness;
  diagnostics: readonly QdnDiagnostic[];
}

export interface ActiveForumDiscussionView extends ActiveForumDiscussion {
  categoryName: string;
}

export interface ActiveForumDiscussionsResult {
  items: ActiveForumDiscussionView[];
  completeness: QueryCompleteness;
  diagnostics: readonly QdnDiagnostic[];
}

// ---- Helpers ----

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
};

/** Convert a validated QDN forum topic envelope to the UI ForumThread type. */
export function toForumThreadView(env: { envelope: { data: Record<string, unknown>; metadata: { name: string; created?: number; updated?: number } }; entityId: string; publisherName: string; publisherAddress: string }): ForumThread {
  const d = env.envelope.data;
  const meta = env.envelope.metadata;
  return {
    id: env.entityId,
    title: (d.title as string) ?? '',
    content: (d.content as string) ?? '',
    categoryId: (d.categoryId as string) ?? '',
    authorName: env.publisherName,
    authorAddress: env.publisherAddress,
    createdAt: meta.created ? new Date(meta.created).toISOString() : null,
    updatedAt: meta.updated ? new Date(meta.updated).toISOString() : null,
    tags: Array.isArray(d.tags) ? d.tags as string[] : [],
  };
}

/** Convert a validated QDN forum reply envelope to the UI ThreadReply type. */
export function toForumReplyView(env: { envelope: { data: Record<string, unknown>; metadata: { name: string; created?: number } }; entityId: string; publisherName: string; publisherAddress: string }): ThreadReply {
  const d = env.envelope.data;
  return {
    id: env.entityId,
    threadId: (d.parentEntityId as string) ?? '',
    authorName: env.publisherName,
    authorAddress: env.publisherAddress,
    content: (d.content as string) ?? '',
    createdAt: env.envelope.metadata.created
      ? new Date(env.envelope.metadata.created).toISOString()
      : null,
    parentReplyId: (d.parentReplyId as string | null) ?? null,
  };
}

function toForumDiscussionThreadInput(env: {
  envelope: { data: Record<string, unknown>; metadata: { created?: number } };
  entityId: string;
}): ForumDiscussionThreadInput {
  const d = env.envelope.data;
  return {
    id: env.entityId,
    categoryId: typeof d.categoryId === 'string' ? d.categoryId : '',
    title: typeof d.title === 'string' ? d.title : '',
    createdAtMs: env.envelope.metadata.created ?? null,
  };
}

function toForumDiscussionReplyInput(env: {
  envelope: { data: Record<string, unknown>; metadata: { created?: number } };
  entityId: string;
}): ForumDiscussionReplyInput {
  const d = env.envelope.data;
  return {
    id: env.entityId,
    threadId: typeof d.parentEntityId === 'string' ? d.parentEntityId : '',
    createdAtMs: env.envelope.metadata.created ?? null,
  };
}

/** Build the set of accepted topic entity IDs from validated topic results. */
function buildAcceptedTopicSet(topicResult: { status: string; items: Array<{ entityId: string }> }): Set<string> {
  if (topicResult.status === 'unavailable') return new Set();
  return new Set(topicResult.items.map((t) => t.entityId));
}

/** Evaluate a reply's parent linkage and return diagnostics for rejected links. */
export function evaluateReplyParent(
  reply: { entityId: string; envelope: { data: Record<string, unknown>; metadata: { identifier?: string } } },
  acceptedTopicIds: Set<string>,
): QdnDiagnostic[] {
  const d = reply.envelope.data;
  const parentId = d.parentEntityId as string | undefined;
  const replyEntityId = reply.entityId;
  const replyIdentifier = reply.envelope.metadata.identifier;

  if (!parentId) {
    return [warningDiag(FORUM_DIAG.REPLY_PARENT_MISSING,
      `Forum reply ${replyEntityId} has no parentEntityId`,
      replyIdentifier ? { identifier: replyIdentifier } : undefined)];
  }

  if (!acceptedTopicIds.has(parentId)) {
    return [warningDiag(FORUM_DIAG.REPLY_PARENT_NOT_ACCEPTED,
      `Forum reply ${replyEntityId} parent ${parentId} is not an accepted topic`,
      replyIdentifier ? { identifier: replyIdentifier } : undefined)];
  }

  return [];
}

// ---- API Definition ----

export const forumApi = createApi({
  reducerPath: 'forumApi', baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['ForumCategories', 'ForumThreads', 'ForumReplies'],
  endpoints: (builder) => ({
    // ===== CATEGORIES (unchanged — current fixed configuration) =====
    getCategories: builder.query<ForumCategory[], void>({
      queryFn: () => queryFn(async () => {
        const result = await fetchValidatedForumTopics();
        const threadCounts = new Map<string, number>();
        const lastActivity = new Map<string, number>();

        if (result.status !== 'unavailable') {
          for (const topic of result.items) {
            const categoryId = topic.envelope.data.categoryId;
            if (!categoryId) continue;
            threadCounts.set(categoryId, (threadCounts.get(categoryId) ?? 0) + 1);
            const activity = topic.envelope.metadata.updated ?? topic.envelope.metadata.created ?? 0;
            if (activity > (lastActivity.get(categoryId) ?? 0)) {
              lastActivity.set(categoryId, activity);
            }
          }
        }

        return CATEGORIES.map((category) => {
          const activity = lastActivity.get(category.id);
          return {
            ...category,
            threadCount: threadCounts.get(category.id) ?? 0,
            lastActivityAt: activity ? new Date(activity).toISOString() : '',
          };
        });
      }),
      providesTags: ['ForumCategories'],
    }),

    // ===== GET THREADS (completeness-exposing, diagnostics-preserving) =====
    getThreads: builder.query<ForumTopicListResult, string>({
      queryFn: (catId) => queryFn(async () => {
        const result = await fetchValidatedForumTopics();
        if (result.status === 'unavailable') throw new Error(result.reason ?? 'Forum topics unavailable.');
        const topics = result.items
          .filter((t) => {
            const d = t.envelope.data as Record<string, unknown>;
            return d.categoryId === catId;
          })
          .map(toForumThreadView);
        return { topics, completeness: result.status, diagnostics: result.diagnostics ?? [] };
      }),
      providesTags: (_r, _e, catId) => [{ type: 'ForumThreads', id: catId }],
    }),

    // ===== GET ACTIVE DISCUSSIONS (dashboard-only derived view) =====
    getActiveDiscussions: builder.query<ActiveForumDiscussionsResult, void>({
      queryFn: () => queryFn(async () => {
        const [topicResult, replyResult] = await Promise.all([
          fetchValidatedForumTopics(),
          fetchValidatedForumReplies(),
        ]);

        if (topicResult.status === 'unavailable') {
          throw new Error(topicResult.reason ?? 'Forum topics unavailable.');
        }

        const threads = topicResult.status === 'empty'
          ? []
          : topicResult.items.map(toForumDiscussionThreadInput);
        const replies = replyResult.status === 'empty' || replyResult.status === 'unavailable'
          ? []
          : replyResult.items.map(toForumDiscussionReplyInput);

        const diagnostics: QdnDiagnostic[] = [
          ...(topicResult.diagnostics ?? []),
          ...(replyResult.diagnostics ?? []),
        ];

        if (replyResult.status === 'unavailable') {
          diagnostics.push(warningDiag(
            'forum-replies-unavailable',
            'Forum replies are currently unavailable. Reply counts may be incomplete.',
          ));
        }

        let completeness: QueryCompleteness;
        if (topicResult.status === 'empty') {
          completeness = 'empty';
        } else if (
          topicResult.status === 'incomplete' ||
          replyResult.status === 'incomplete' ||
          replyResult.status === 'unavailable'
        ) {
          completeness = 'incomplete';
        } else {
          completeness = 'complete';
        }

        const categoryNames = new Map(CATEGORIES.map((category) => [
          category.id,
          category.name,
        ]));
        const items = buildActiveForumDiscussions(threads, replies).map(
          (discussion) => ({
            ...discussion,
            categoryName:
              categoryNames.get(discussion.categoryId) ?? discussion.categoryId,
          }),
        );

        return { items, completeness, diagnostics };
      }),
      providesTags: ['ForumThreads', 'ForumReplies'],
    }),

    // ===== GET THREAD (completeness-exposing, strict parent-link reduction, diagnostics-preserving) =====
    getThread: builder.query<ForumThreadResult, string>({
      queryFn: (threadId) => queryFn(async () => {
        const [topicResult, replyResult] = await Promise.all([
          fetchValidatedForumTopics(),
          fetchValidatedForumReplies(),
        ]);

        if (topicResult.status === 'unavailable') throw new Error(topicResult.reason ?? 'Forum topics unavailable.');

        const found = topicResult.items.find((t) => t.entityId === threadId);
        if (!found) throw new Error(`Thread ${threadId} not found.`);

        const thread = toForumThreadView(found);

        // Collect diagnostics from topic and reply queries
        const allDiagnostics: QdnDiagnostic[] = [
          ...(topicResult.diagnostics ?? []),
          ...(replyResult.diagnostics ?? []),
        ];

        // Strict parent-link reduction with diagnostics
        const acceptedTopicIds = buildAcceptedTopicSet(topicResult);
        const replies: ThreadReply[] = [];
        if (replyResult.status !== 'unavailable') {
          for (const r of replyResult.items) {
            const d = r.envelope.data as Record<string, unknown>;
            const parentId = d.parentEntityId as string | undefined;

            // Evaluate parent linkage
            const parentDiags = evaluateReplyParent(r, acceptedTopicIds);
            if (parentDiags.length > 0) {
              allDiagnostics.push(...parentDiags);
              continue;
            }

            // Group: only replies for the requested thread appear under this thread
            if (parentId !== threadId) continue;
            replies.push(toForumReplyView(r));
          }
        }

        const topicCompleteness = topicResult.status === 'complete' && (replyResult.status === 'complete' || replyResult.status === 'empty')
          ? 'complete' as const
          : 'incomplete' as const;

        return { thread: { ...thread, replies }, completeness: topicCompleteness, diagnostics: allDiagnostics };
      }),
      providesTags: (_r, _e, threadId) => [{ type: 'ForumThreads', id: threadId }, 'ForumReplies'],
    }),

    // ===== ADD REPLY (canonical identifier + validated payload) =====
    addReply: builder.mutation<ThreadReply, { threadId: string; content: string; authorName: string; authorAddress: string; parentReplyId?: string | null }>({
      queryFn: async (input) => {
        try {
          const entityId = `fr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const payload = buildForumReplyPayload({
            entityId,
            parentEntityId: input.threadId,
            parentReplyId: input.parentReplyId ?? null,
            content: input.content,
            ownerName: input.authorName,
            ownerAddress: input.authorAddress,
          });
          const identifier = buildQucpIdentifier('qucp-forum-reply', entityId);
          await publishJsonResource({ service: 'DOCUMENT', identifier, payload, title: `Reply by ${input.authorName}`, description: input.content.slice(0, 200), filename: `${entityId}.json` });
          const reply: ThreadReply = { id: entityId, threadId: input.threadId, authorName: input.authorName, authorAddress: input.authorAddress, content: input.content, createdAt: new Date().toISOString(), parentReplyId: input.parentReplyId ?? null };
          return { data: reply };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to publish reply.' };
        }
      },
      invalidatesTags: (_r, _e, { threadId }) => [{ type: 'ForumReplies', id: threadId }, { type: 'ForumThreads', id: threadId }],
    }),

    // ===== CREATE THREAD (canonical identifier + validated payload) =====
    createThread: builder.mutation<ForumThread, { categoryId: string; title: string; content: string; authorName: string; authorAddress: string; tags?: string[] }>({
      queryFn: async (input) => {
        try {
          const entityId = `ft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const payload = buildForumTopicPayload({
            entityId,
            categoryId: input.categoryId,
            title: input.title,
            content: input.content,
            tags: input.tags ?? [],
            ownerName: input.authorName,
            ownerAddress: input.authorAddress,
          });
          const identifier = buildQucpIdentifier('qucp-forum-topic', entityId);
          await publishJsonResource({ service: 'DOCUMENT', identifier, payload, title: input.title, description: input.content.slice(0, 200), filename: `${entityId}.json` });
          const thread: ForumThread = { id: entityId, title: input.title, content: input.content, categoryId: input.categoryId, authorName: input.authorName, authorAddress: input.authorAddress, createdAt: new Date().toISOString(), tags: input.tags ?? [] };
          return { data: thread };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to publish thread.' };
        }
      },
      invalidatesTags: (_r, _e, { categoryId }) => [{ type: 'ForumThreads', id: categoryId }, 'ForumCategories'],
    }),
  }),
});

export const {
  useGetCategoriesQuery,
  useGetThreadsQuery,
  useGetThreadQuery,
  useGetActiveDiscussionsQuery,
  useAddReplyMutation,
  useCreateThreadMutation,
} = forumApi;
