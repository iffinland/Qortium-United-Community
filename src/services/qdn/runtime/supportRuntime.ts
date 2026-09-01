// ===== QDN Runtime Support Adapter =====
//
// Bridges QDN foundation to support-specific features:
// tickets, ticket replies, and admin-managed categories.

import type { QucpSupportTicket } from '../schemas/supportTicketSchema';
import type { QucpTicketReply } from '../schemas/ticketReplySchema';
import type { QucpSupportCategory } from '../schemas/supportCategorySchema';
import type { ValidatedRuntimeQueryResult } from './runtimeTypes';
import { validatedRuntimeQuery, type RuntimeQueryParams } from './validatedQueryRuntime';
import { supportTicketPolicy } from '../policies/supportTicketPolicy';
import { ticketReplyPolicy } from '../policies/ticketReplyPolicy';
import { supportCategoryPolicy } from '../policies/supportCategoryPolicy';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';

// ---- Discovery Prefixes ----

export const SUPPORT_TICKET_SEARCH_PREFIX = 'qucp-support-ticket-' as const;
export const TICKET_REPLY_SEARCH_PREFIX = 'qucp-ticket-reply-' as const;
export const SUPPORT_CATEGORY_SEARCH_PREFIX = 'qucp-support-category-' as const;

/**
 * Support tickets are small public documents and normally fetch in well under
 * a second. A single QDN resource that is still downloading, missing data, or
 * otherwise not fetchable must not hold the whole support board in the loading
 * state for the bridge's full read timeout. When this timeout is hit, the
 * resource is recorded as a fetch failure and the board renders the valid
 * partial set with its existing incomplete-state notice.
 */
const SUPPORT_TICKET_FETCH_TIMEOUT_MS = 2000;

// ---- Query Result Types ----

export type SupportTicketQueryResult = ValidatedRuntimeQueryResult<QucpSupportTicket>;
export type TicketReplyQueryResult = ValidatedRuntimeQueryResult<QucpTicketReply>;
export type SupportCategoryQueryResult = ValidatedRuntimeQueryResult<QucpSupportCategory>;

// ---- Publication Builders ----

export function buildSupportTicketPayload(input: {
  entityId: string;
  title: string;
  description: string;
  type: 'bug' | 'feature' | 'question' | 'general';
  categoryId: string;
  ownerName: string;
  ownerAddress: string;
  now?: number;
}): QucpSupportTicket {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-support-ticket',
    entityId: input.entityId,
    title: input.title,
    description: input.description,
    type: input.type,
    userPriority: 'medium',
    categoryId: input.categoryId,
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    createdAt: input.now ?? Date.now(),
  };
}

export function buildTicketReplyPayload(input: {
  entityId: string;
  parentEntityId: string;
  content: string;
  ownerName: string;
  ownerAddress: string;
  now?: number;
}): QucpTicketReply {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-ticket-reply',
    entityId: input.entityId,
    parentEntityId: input.parentEntityId,
    content: input.content,
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    createdAt: input.now ?? Date.now(),
  };
}

export function buildSupportCategoryPayload(input: {
  entityId: string;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder?: number;
  ownerName: string;
  ownerAddress: string;
  now?: number;
}): QucpSupportCategory {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-support-category',
    entityId: input.entityId,
    name: input.name,
    description: input.description,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    createdAt: input.now ?? Date.now(),
  };
}

// ---- Historical Authorization ----

import {
  verifyCategoryHistoricalAuthorization,
  categoryHistoricalAuthDiagnostic,
} from './categoryHistoricalAuth';
import type { ValidatedResource } from './runtimeTypes';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';

/**
 * Post-process validated categories to enforce historical role authorization.
 *
 * For each accepted category, verifies that the publisher had Admin or SysOp
 * authority at the time the category was published (using trusted QDN metadata).
 * Unauthorized categories are moved to the rejected set.
 *
 * Completeness is degraded if role history is not fully available.
 */
export function applyCategoryHistoricalAuthorization(
  categoryResult: SupportCategoryQueryResult,
  roleSnapshots: Array<{
    envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>;
    snapshotEntityId: string;
  }>,
  roleHistoryComplete: boolean,
  roleLineageValid: boolean,
  roleLineageStatus?: string,
): SupportCategoryQueryResult {
  // If category result is not in a state with items, return as-is
  if (categoryResult.status === 'unavailable' || categoryResult.status === 'empty') {
    return categoryResult;
  }

  const authorizedItems: ValidatedResource<QucpSupportCategory>[] = [];
  let rejectedCount = categoryResult.rejectedCount;
  const diagnostics = [...(categoryResult.diagnostics ?? [])];

  for (const item of categoryResult.items) {
    // The trusted effective mutation/publication time is QDN `updated` when
    // present. A QDN coordinate overwrite keeps `created` but advances
    // `updated`, so trusting only `created` would let a revoked Admin keep
    // updating an old resource indefinitely.
    const categoryQdnCreatedTime =
      item.envelope.metadata.updated ?? item.envelope.metadata.created;
    const publisherWallet = item.publisherAddress;

    const authResult = verifyCategoryHistoricalAuthorization({
      publisherWallet,
      categoryQdnCreatedTime,
      roleSnapshots,
      roleHistoryComplete,
      roleLineageValid,
      roleLineageStatus,
    });

    if (authResult.authorized) {
      authorizedItems.push(item);
    } else {
      rejectedCount++;
      diagnostics.push(
        categoryHistoricalAuthDiagnostic(
          authResult.reason,
          item.entityId,
          publisherWallet,
          authResult.detail,
        ),
      );
    }
  }

  // Recompute completeness: if role history is incomplete/unavailable,
  // completeness degrades
  let completeness = categoryResult.status;
  if (!roleHistoryComplete || !roleLineageValid) {
    completeness = 'incomplete';
  } else if (roleSnapshots.length === 0 && authorizedItems.length === 0) {
    // No role snapshots but we have categories — these must all be SysOp categories
    // (only SysOp passes without role snapshot). Completeness stays as-is.
  }

  if (authorizedItems.length === 0 && (categoryResult.status === 'complete' || categoryResult.status === 'incomplete')) {
    // If completeness was degraded, keep 'incomplete' instead of switching to 'empty'
    return {
      status: completeness === 'incomplete' ? 'incomplete' : 'empty',
      items: [],
      diagnostics,
    } as SupportCategoryQueryResult;
  }

  return {
    status: completeness,
    items: authorizedItems,
    rejectedCount,
    quarantinedCount: categoryResult.quarantinedCount,
    diagnostics,
  } as SupportCategoryQueryResult;
}

// ---- Query Functions ----

export async function querySupportTickets(
  searchFn: QdnSearchFn, fetchFn: QdnFetchFn, identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<SupportTicketQueryResult> {
  return validatedRuntimeQuery<QucpSupportTicket>(searchFn, fetchFn, parseSupportTicketPayload, supportTicketPolicy, identityResolver, {
    service: params?.service ?? 'DOCUMENT',
    identifierPrefix: params?.identifierPrefix ?? SUPPORT_TICKET_SEARCH_PREFIX,
    pageSize: params?.pageSize,
    safetyMax: params?.safetyMax,
    signal: params?.signal,
    fetchTimeoutMs: params?.fetchTimeoutMs ?? SUPPORT_TICKET_FETCH_TIMEOUT_MS,
  });
}

export async function queryTicketReplies(
  searchFn: QdnSearchFn, fetchFn: QdnFetchFn, identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<TicketReplyQueryResult> {
  return validatedRuntimeQuery<QucpTicketReply>(searchFn, fetchFn, parseTicketReplyPayload, ticketReplyPolicy, identityResolver, {
    service: params?.service ?? 'DOCUMENT',
    identifierPrefix: params?.identifierPrefix ?? TICKET_REPLY_SEARCH_PREFIX,
    pageSize: params?.pageSize, safetyMax: params?.safetyMax, signal: params?.signal,
  });
}

export async function querySupportCategories(
  searchFn: QdnSearchFn, fetchFn: QdnFetchFn, identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<SupportCategoryQueryResult> {
  return validatedRuntimeQuery<QucpSupportCategory>(searchFn, fetchFn, parseSupportCategoryPayload, supportCategoryPolicy, identityResolver, {
    service: params?.service ?? 'DOCUMENT',
    identifierPrefix: params?.identifierPrefix ?? SUPPORT_CATEGORY_SEARCH_PREFIX,
    pageSize: params?.pageSize, safetyMax: params?.safetyMax, signal: params?.signal,
    // Support categories are Admin-managed shared state: a currently-authorized
    // Admin may supersede another Admin's previously published category.
    sharedAdminOwnership: true,
    adminAuthority: params?.adminAuthority,
  });
}

// ---- Payload Parsers ----

function parseSupportTicketPayload(raw: unknown): QucpSupportTicket | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-support-ticket') return null;
  return d as QucpSupportTicket;
}

function parseTicketReplyPayload(raw: unknown): QucpTicketReply | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-ticket-reply') return null;
  return d as QucpTicketReply;
}

function parseSupportCategoryPayload(raw: unknown): QucpSupportCategory | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-support-category') return null;
  return d as QucpSupportCategory;
}
