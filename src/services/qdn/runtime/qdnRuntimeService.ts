// ===== QDN Runtime Service =====
//
// Initializes the bridge-connected runtime functions for feature API use.
// Provides domain-specific query helpers for posts, comments, and wiki.

import { requestQortium } from '../../qortium/qortiumClient';
import { findFirstQdnImageRef } from '../../rich-text/richText';
import type { QdnImageRef } from '../../../types';
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
  buildWikiCreatePayload,
  buildWikiUpdatePayload,
  generateWikiEntityId,
  wikiSlug,
  fetchValidatedWikiArticleByEntityId as fetchWikiArticleById,
  type WikiQueryResult,
  type WikiArticleLookupResult,
} from './wikiRuntime';
import {
  queryEvents,
  buildEventCreatePayload,
  buildEventUpdatePayload,
  generateEventEntityId,
  fetchValidatedEventByEntityId as fetchEventById,
  type EventQueryResult,
  type EventLookupResult,
} from './eventRuntime';
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
import {
  querySupportTicketStatuses,
  buildSupportTicketClosePayload,
  buildSupportRoleContext,
  reduceSupportTicketStatuses,
  reduceSupportTicketCloseBoundary,
  evaluateTicketReplyAgainstClose,
  authorizeSupportTicketCloseActor,
  type SupportTicketStatusQueryResult,
  type SupportRoleContext,
  type EffectiveSupportTicketStatus,
  type SupportTicketTargetOwner,
  type SupportTicketCloseBoundary,
  type TicketReplyCloseDecision,
} from './supportTicketStatusRuntime';
import {
  buildAdminRoleHistoryContext,
  createAdminAuthorityProvider,
} from '../roles/adminHistoricalAuthorization';
import type { AdminAuthorityProvider } from './runtimeTypes';

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

// Identity resolution uses the dedicated GET_NAME_DATA bridge action. The
// generic fetchFn above must not be reused here because it would incorrectly
// issue FETCH_QDN_RESOURCE for a name lookup.
const nameLookupFetchFn: QdnFetchFn = async (params) => {
  return requestQortium<unknown>({
    action: 'GET_NAME_DATA',
    name: params.name,
  });
};

// ---- Identity Resolver Initialization ----

try {
  getIdentityResolver(nameLookupFetchFn);
} catch {
  // Already initialized or bridge not available
}

// ---- Domain Query Functions ----

export async function fetchValidatedPosts(): Promise<PostQueryResult> {
  const adminAuthority = await buildAdminAuthority();
  return queryPosts(searchFn, fetchFn, getIdentityResolver(), {
    adminAuthority,
    sharedAdminOwnership: true,
  });
}

export async function fetchValidatedComments(): Promise<CommentQueryResult> {
  return queryComments(searchFn, fetchFn, getIdentityResolver());
}

export async function fetchValidatedWiki(): Promise<WikiQueryResult> {
  const adminAuthority = await buildAdminAuthority();
  return queryWikiArticles(searchFn, fetchFn, getIdentityResolver(), {
    adminAuthority,
    sharedAdminOwnership: true,
  });
}

export async function fetchValidatedWikiArticleByEntityId(entityId: string): Promise<WikiArticleLookupResult> {
  const adminAuthority = await buildAdminAuthority();
  return fetchWikiArticleById(searchFn, fetchFn, getIdentityResolver(), entityId, adminAuthority);
}

export async function fetchValidatedEvents(): Promise<EventQueryResult> {
  const adminAuthority = await buildAdminAuthority();
  return queryEvents(searchFn, fetchFn, getIdentityResolver(), {
    adminAuthority,
    sharedAdminOwnership: true,
  });
}

export async function fetchValidatedEventByEntityId(entityId: string): Promise<EventLookupResult> {
  const adminAuthority = await buildAdminAuthority();
  return fetchEventById(searchFn, fetchFn, getIdentityResolver(), entityId, adminAuthority);
}

export async function fetchMediaReference(
  mediaEntityId: string,
  signal?: AbortSignal,
): Promise<MediaReferenceResolution> {
  return resolveMediaReference(mediaEntityId, searchFn, fetchFn, getIdentityResolver(), signal);
}

/**
 * Resolve the display image for a content body.
 *
 * New rich content stores an inline [imageqdn] marker directly in the body.
 * Older resources may still use a legacy qucp-media-reference entity ID; that
 * path is retained only for read compatibility and is not used by new writes.
 */
export async function fetchContentImageRef(
  content: string,
  legacyMediaEntityId?: string,
): Promise<QdnImageRef | null> {
  const inline = findFirstQdnImageRef(content);
  if (inline) return inline;

  if (
    legacyMediaEntityId &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(legacyMediaEntityId)
  ) {
    const resolution = await resolveMediaReference(
      legacyMediaEntityId,
      searchFn,
      fetchFn,
      getIdentityResolver(),
    );
    const view = toResolvedMediaView(resolution, false);
    if (view.status === 'resolved' && view.service === 'IMAGE') {
      return {
        service: 'IMAGE',
        name: view.publisherName,
        identifier: view.identifier,
      };
    }
  }

  return null;
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

export async function fetchValidatedSupportTicketStatuses(): Promise<SupportTicketStatusQueryResult> {
  return querySupportTicketStatuses(searchFn, fetchFn, getIdentityResolver());
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
  const adminAuthority = await buildAdminAuthority();
  return queryPolls(searchFn, fetchFn, getIdentityResolver(), {
    adminAuthority,
    sharedAdminOwnership: true,
  });
}

export async function fetchValidatedVotes(): Promise<VoteQueryResult> {
  return queryVotes(searchFn, fetchFn, getIdentityResolver());
}

export { reducePollResults, reduceVoteResultsWithPollContext, derivePollResults, buildDeterministicVoteEntityId };
export type { ReducedPollListResult, DerivedPollResults };

export async function fetchValidatedProjects(): Promise<ProjectQueryResult> {
  const adminAuthority = await buildAdminAuthority();
  return queryProjects(searchFn, fetchFn, getIdentityResolver(), {
    adminAuthority,
    sharedAdminOwnership: true,
  });
}

/**
 * Build the fail-closed Admin/SysOp authority provider from canonical role
 * snapshot lineage. Reads must not succeed on admin-managed content unless
 * this provider confirms authority at the resource's trusted mutation time.
 */
async function buildAdminAuthority(): Promise<AdminAuthorityProvider> {
  const roleResult = await fetchValidatedRoleSnapshots();
  const context = buildAdminRoleHistoryContext(roleResult);
  return createAdminAuthorityProvider(context);
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

export {
  buildPostPayload,
  buildCommentPayload,
  buildWikiCreatePayload,
  buildWikiUpdatePayload,
  generateWikiEntityId,
  wikiSlug,
  buildEventCreatePayload,
  buildEventUpdatePayload,
  generateEventEntityId,
  buildTombstonePayload,
  buildForumTopicPayload,
  buildForumReplyPayload,
  buildSupportTicketPayload,
  buildTicketReplyPayload,
  buildSupportCategoryPayload,
  buildSupportTicketClosePayload,
  buildSupportRoleContext,
  reduceSupportTicketStatuses,
  reduceSupportTicketCloseBoundary,
  evaluateTicketReplyAgainstClose,
  authorizeSupportTicketCloseActor,
};
export { toResolvedMediaView };

// ---- Re-exports ----

export type {
  PostQueryResult,
  CommentQueryResult,
  WikiQueryResult,
  EventQueryResult,
  EventLookupResult,
  ForumTopicQueryResult,
  ForumReplyQueryResult,
  SupportTicketQueryResult,
  TicketReplyQueryResult,
  SupportCategoryQueryResult,
  SupportTicketStatusQueryResult,
  SupportRoleContext,
  EffectiveSupportTicketStatus,
  SupportTicketTargetOwner,
  SupportTicketCloseBoundary,
  TicketReplyCloseDecision,
  ProjectQueryResult,
  MediaReferenceResolution,
  TombstoneQueryResult,
  TombstoneComposition,
};

export { resetIdentityResolver };
