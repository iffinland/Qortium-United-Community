// ===== QDN Runtime Service =====
//
// Initializes the bridge-connected runtime functions for feature API use.
// Provides domain-specific query helpers for posts, comments, and wiki.

import { requestQortium } from '../../qortium/qortiumClient';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import {
  getIdentityResolver,
  resetIdentityResolver,
} from './identityResolverAdapter';
import {
  queryPosts,
  buildPostPayload,
  type PostQueryResult,
} from './postRuntime';
import {
  queryComments,
  buildCommentPayload,
  type CommentQueryResult,
} from './commentRuntime';
import {
  queryWikiArticles,
  buildWikiPayload,
  type WikiQueryResult,
} from './wikiRuntime';
import {
  resolveMediaReference,
  toResolvedMediaView,
  type MediaReferenceResolution,
} from './mediaRuntime';
import {
  queryTombstones,
  buildTombstonePayload,
  buildTombstoneComposition,
  type TombstoneQueryResult,
  type TombstoneComposition,
} from './tombstoneRuntime';
import {
  queryForumTopics,
  queryForumReplies,
  buildForumTopicPayload,
  buildForumReplyPayload,
  type ForumTopicQueryResult,
  type ForumReplyQueryResult,
} from './forumRuntime';
import {
  querySupportTickets,
  queryTicketReplies,
  querySupportCategories,
  buildSupportTicketPayload,
  buildTicketReplyPayload,
  buildSupportCategoryPayload,
  type SupportTicketQueryResult,
  type TicketReplyQueryResult,
  type SupportCategoryQueryResult,
} from './supportRuntime';

// ---- Bridge Search Function ----

const searchFn: QdnSearchFn = async (params) => {
  const results = await requestQortium<unknown[]>({
    action: 'SEARCH_QDN_RESOURCES',
    service: params.service,
    identifier: params.identifier,
    prefix: params.prefix,
    mode: 'ALL',
    limit: params.limit,
    offset: params.offset,
    reverse: params.reverse,
    includeMetadata: params.includeMetadata,
  });
  return results ?? [];
};

// ---- Bridge Fetch Function ----

const fetchFn: QdnFetchFn = async (params) => {
  return requestQortium<unknown>({
    action: 'FETCH_QDN_RESOURCE',
    service: params.service,
    name: params.name,
    identifier: params.identifier,
  });
};

// ---- Identity Resolver Initialization ----

try {
  getIdentityResolver(fetchFn);
} catch {
  // Already initialized or bridge not available
}

// ---- Domain Query Functions ----

export async function fetchValidatedPosts(): Promise<PostQueryResult> {
  return queryPosts(searchFn, fetchFn, getIdentityResolver());
}

export async function fetchValidatedComments(): Promise<CommentQueryResult> {
  return queryComments(searchFn, fetchFn, getIdentityResolver());
}

export async function fetchValidatedWiki(): Promise<WikiQueryResult> {
  return queryWikiArticles(searchFn, fetchFn, getIdentityResolver());
}

export async function fetchMediaReference(
  mediaEntityId: string,
  signal?: AbortSignal,
): Promise<MediaReferenceResolution> {
  return resolveMediaReference(mediaEntityId, searchFn, fetchFn, getIdentityResolver(), signal);
}

// ---- Tombstone Functions ----

let _cachedTombstoneQuery: TombstoneQueryResult | null = null;
let _cachedTombstoneComposition: TombstoneComposition | null = null;

export async function fetchValidatedTombstones(): Promise<TombstoneQueryResult> {
  _cachedTombstoneQuery = await queryTombstones(searchFn, fetchFn, getIdentityResolver());
  _cachedTombstoneComposition = buildTombstoneComposition(_cachedTombstoneQuery);
  return _cachedTombstoneQuery;
}

export function getTombstoneComposition(): TombstoneComposition | null {
  return _cachedTombstoneComposition;
}

export async function fetchValidatedForumTopics(): Promise<ForumTopicQueryResult> {
  return queryForumTopics(searchFn, fetchFn, getIdentityResolver());
}

export async function fetchValidatedForumReplies(): Promise<ForumReplyQueryResult> {
  return queryForumReplies(searchFn, fetchFn, getIdentityResolver());
}

export async function fetchValidatedSupportTickets(): Promise<SupportTicketQueryResult> {
  return querySupportTickets(searchFn, fetchFn, getIdentityResolver());
}

export async function fetchValidatedTicketReplies(): Promise<TicketReplyQueryResult> {
  return queryTicketReplies(searchFn, fetchFn, getIdentityResolver());
}

export async function fetchValidatedSupportCategories(): Promise<SupportCategoryQueryResult> {
  return querySupportCategories(searchFn, fetchFn, getIdentityResolver());
}

// ---- Poll & Vote Queries ----

import {
  queryPolls, reducePollResults,
  type PollQueryResult, type ReducedPollListResult,
} from './pollRuntime';
import {
  queryVotes, reduceVoteResultsWithPollContext,
  type VoteQueryResult,
} from './voteRuntime';
import { derivePollResults, type DerivedPollResults } from './pollResultDerivation';
import { buildDeterministicVoteEntityId } from './voteReduction';

// ---- Project Queries ----

import {
  queryProjects,
  type ProjectQueryResult,
} from './projectRuntime';

export async function fetchValidatedPolls(): Promise<PollQueryResult> {
  return queryPolls(searchFn, fetchFn, getIdentityResolver());
}

export async function fetchValidatedVotes(): Promise<VoteQueryResult> {
  return queryVotes(searchFn, fetchFn, getIdentityResolver());
}

export { reducePollResults, reduceVoteResultsWithPollContext, derivePollResults, buildDeterministicVoteEntityId };
export type { ReducedPollListResult, DerivedPollResults };

export async function fetchValidatedProjects(): Promise<ProjectQueryResult> {
  return queryProjects(searchFn, fetchFn, getIdentityResolver());
}

export { reduceProjectResults, type ReducedProjectListResult } from './projectRuntime';

// ---- Role Snapshot Query ----

import { queryRoleSnapshots, getLatestRoleSnapshot, type RoleSnapshotQueryResult } from './roleSnapshotRuntime';

let _cachedRoleSnapshotQuery: RoleSnapshotQueryResult | null = null;

export async function fetchValidatedRoleSnapshots(): Promise<RoleSnapshotQueryResult> {
  _cachedRoleSnapshotQuery = await queryRoleSnapshots(searchFn, fetchFn, getIdentityResolver());
  return _cachedRoleSnapshotQuery;
}

export function getCachedRoleSnapshot(): import('../schemas/roleRegistrySnapshotSchema').QucpRoleRegistrySnapshot | null {
  if (!_cachedRoleSnapshotQuery) return null;
  return getLatestRoleSnapshot(_cachedRoleSnapshotQuery);
}

// ---- Publication Helpers ----

export { buildPostPayload, buildCommentPayload, buildWikiPayload, buildTombstonePayload, buildForumTopicPayload, buildForumReplyPayload, buildSupportTicketPayload, buildTicketReplyPayload, buildSupportCategoryPayload };
export { toResolvedMediaView };

// ---- Re-exports ----

export type {
  PostQueryResult,
  CommentQueryResult,
  WikiQueryResult,
  ForumTopicQueryResult,
  ForumReplyQueryResult,
  SupportTicketQueryResult,
  TicketReplyQueryResult,
  SupportCategoryQueryResult,
  ProjectQueryResult,
  MediaReferenceResolution,
  TombstoneQueryResult,
  TombstoneComposition,
};

export { resetIdentityResolver };
