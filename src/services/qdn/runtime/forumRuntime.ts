// ===== QDN Runtime Forum Adapter =====
//
// Bridges the QDN foundation to forum-specific feature APIs.
// Uses the shared validated query runtime for canonical ownership selection.
//
// Canonical ownership: first accepted publisher establishes canonical wallet.
// Latest accepted snapshot from that wallet is authoritative.
// Foreign publisher snapshots are ignored.

import type { QucpForumTopic } from '../schemas/forumTopicSchema';
import type { QucpForumReply } from '../schemas/forumReplySchema';
import type { ValidatedRuntimeQueryResult, ValidatedResource } from './runtimeTypes';
import { validatedRuntimeQuery, type RuntimeQueryParams } from './validatedQueryRuntime';
import { forumTopicPolicy } from '../policies/forumTopicPolicy';
import { forumReplyPolicy } from '../policies/forumReplyPolicy';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';

// ---- Discovery Prefixes ----

export const FORUM_TOPIC_SEARCH_PREFIX = 'qucp-forum-topic-' as const;
export const FORUM_REPLY_SEARCH_PREFIX = 'qucp-forum-reply-' as const;

// ---- Query Result Types ----

export type ForumTopicQueryResult = ValidatedRuntimeQueryResult<QucpForumTopic>;
export type ForumReplyQueryResult = ValidatedRuntimeQueryResult<QucpForumReply>;
export type ValidatedForumTopic = ValidatedResource<QucpForumTopic>;
export type ValidatedForumReply = ValidatedResource<QucpForumReply>;

// ---- Publication Builders ----

export function buildForumTopicPayload(input: {
  entityId: string;
  categoryId: string;
  title: string;
  content: string;
  tags?: string[];
  ownerName: string;
  ownerAddress: string;
  now?: number;
}): QucpForumTopic {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-forum-topic',
    entityId: input.entityId,
    categoryId: input.categoryId,
    title: input.title,
    content: input.content,
    tags: input.tags ?? [],
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    createdAt: input.now ?? Date.now(),
  };
}

export function buildForumReplyPayload(input: {
  entityId: string;
  parentEntityId: string;
  parentReplyId?: string | null;
  content: string;
  ownerName: string;
  ownerAddress: string;
  now?: number;
}): QucpForumReply {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-forum-reply',
    entityId: input.entityId,
    parentEntityId: input.parentEntityId,
    parentReplyId: input.parentReplyId ?? null,
    content: input.content,
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    createdAt: input.now ?? Date.now(),
  };
}

// ---- Query Functions ----

export async function queryForumTopics(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<ForumTopicQueryResult> {
  return validatedRuntimeQuery<QucpForumTopic>(
    searchFn,
    fetchFn,
    parseForumTopicPayload,
    forumTopicPolicy,
    identityResolver,
    {
      service: params?.service ?? 'DOCUMENT',
      identifierPrefix: params?.identifierPrefix ?? FORUM_TOPIC_SEARCH_PREFIX,
      pageSize: params?.pageSize,
      safetyMax: params?.safetyMax,
      signal: params?.signal,
    },
  );
}

export async function queryForumReplies(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<ForumReplyQueryResult> {
  return validatedRuntimeQuery<QucpForumReply>(
    searchFn,
    fetchFn,
    parseForumReplyPayload,
    forumReplyPolicy,
    identityResolver,
    {
      service: params?.service ?? 'DOCUMENT',
      identifierPrefix: params?.identifierPrefix ?? FORUM_REPLY_SEARCH_PREFIX,
      pageSize: params?.pageSize,
      safetyMax: params?.safetyMax,
      signal: params?.signal,
    },
  );
}

// ---- Payload Parsers ----

function parseForumTopicPayload(raw: unknown): QucpForumTopic | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.entityId !== 'string') return null;
  if (typeof d.title !== 'string') return null;
  if (typeof d.content !== 'string') return null;
  if (d.resourceFamily !== 'qucp-forum-topic') return null;
  return d as QucpForumTopic;
}

function parseForumReplyPayload(raw: unknown): QucpForumReply | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.entityId !== 'string') return null;
  if (typeof d.parentEntityId !== 'string') return null;
  if (typeof d.content !== 'string') return null;
  if (d.resourceFamily !== 'qucp-forum-reply') return null;
  return d as QucpForumReply;
}
