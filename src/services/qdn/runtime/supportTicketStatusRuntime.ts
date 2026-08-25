// ===== Support Ticket Status Runtime =====
//
// Canonical ticket lifecycle operations:
//   Open -> Closed (close only; reopen is intentionally unsupported).
//
// Close operations are QDN-published resources keyed by target ticket and
// actor wallet. Read paths validate each operation through the support ticket
// status policy, authorize the actor (author, SysOp, or Admin-at-publication),
// and reduce to the effective Open/Closed state.

import type { QucpSupportTicketStatus } from '../schemas/supportTicketStatusSchema';
import type { QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';
import {
  classifyRuntimeQuery,
  type ValidatedRuntimeQueryResult,
  type ValidatedResource,
  type RuntimeDiagnostic,
} from './runtimeTypes';
import { ValidationReasonCodes } from '../validationTypes';
import { paginatedQdnSearch } from '../paginatedQdnSearch';
import { boundedFetchResources } from '../fetchQdnResources';
import { validateResource } from '../validationPipeline';
import { supportTicketStatusPolicy } from '../policies/supportTicketStatusPolicy';
import { verifyCategoryHistoricalAuthorization } from './categoryHistoricalAuth';
import { QUC_SYSOP_ADDRESS } from '../../../config/qortiumTrust';
import {
  validateRoleLineageFromQuery,
  describeRoleLineage,
} from '../roles/registryLineage';
import type { RoleSnapshotQueryResult } from './roleSnapshotRuntime';

// ---- Discovery Prefix ----

export const SUPPORT_TICKET_STATUS_SEARCH_PREFIX = 'qucp-stc-' as const;

// ---- Query Result ----

export type SupportTicketStatusQueryResult = ValidatedRuntimeQueryResult<QucpSupportTicketStatus>;
export type ValidatedSupportTicketStatus = ValidatedResource<QucpSupportTicketStatus>;

// ---- Publication Builder ----

export function buildSupportTicketClosePayload(input: {
  operationId: string;
  targetEntityId: string;
  actorName: string;
  actorAddress: string;
  reason?: string;
  now?: number;
}): QucpSupportTicketStatus {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-support-ticket-status',
    operationId: input.operationId,
    targetFamily: 'qucp-support-ticket',
    targetEntityId: input.targetEntityId,
    actorName: input.actorName,
    actorAddress: input.actorAddress,
    action: 'close',
    reason: input.reason,
    createdAt: input.now ?? Date.now(),
  };
}

// ---- Role History Context ----

export interface SupportRoleContext {
  roleSnapshots: Array<{
    envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>;
    snapshotEntityId: string;
  }>;
  snapshotMap: Map<string, { snapshot: QucpRoleRegistrySnapshot; identifier: string }>;
  roleHistoryComplete: boolean;
  roleHistoryUnavailable: boolean;
  roleLineageValid: boolean;
  roleLineageStatus?: string;
}

export function buildSupportRoleContext(
  roleResult: RoleSnapshotQueryResult,
): SupportRoleContext {
  const roleSnapshots: SupportRoleContext['roleSnapshots'] = [];
  const snapshotMap = new Map<string, { snapshot: QucpRoleRegistrySnapshot; identifier: string }>();

  if (roleResult.status !== 'unavailable' && roleResult.status !== 'empty') {
    for (const item of roleResult.items) {
      const snap = item.envelope.data;
      snapshotMap.set(snap.snapshotId, {
        snapshot: snap,
        identifier: item.envelope.metadata.identifier,
      });
      roleSnapshots.push({
        envelope: item.envelope as QdnResourceEnvelope<QucpRoleRegistrySnapshot>,
        snapshotEntityId: snap.snapshotId,
      });
    }
  }

  const lineage = validateRoleLineageFromQuery(snapshotMap, roleResult.status);
  const roleLineageValid = lineage.valid;
  const roleHistoryComplete =
    roleResult.status === 'complete' || roleResult.status === 'empty';
  const roleHistoryUnavailable = roleResult.status === 'unavailable';

  return {
    roleSnapshots,
    snapshotMap,
    roleHistoryComplete,
    roleHistoryUnavailable,
    roleLineageValid,
    roleLineageStatus: roleLineageValid ? undefined : describeRoleLineage(lineage),
  };
}

// ---- Target Owner ----

export interface SupportTicketTargetOwner {
  ownerName: string;
  ownerAddress: string;
  entityId: string;
  resourceFamily: string;
}

// ---- Authorization ----

export type TicketCloseAuthorizationResult =
  | {
      authorized: true;
      source: 'author' | 'sysop-trust-anchor' | 'admin-at-publication';
      snapshotEntityId?: string;
    }
  | {
      authorized: false;
      reason: string;
      detail?: string;
    };

/**
 * Authorize a close actor against a ticket's canonical author and, for
 * non-author closes, the role history at the operation's QDN creation time.
 */
export function authorizeSupportTicketCloseActor(input: {
  actorAddress: string;
  actorName?: string;
  targetOwner: SupportTicketTargetOwner;
  operationQdnCreatedTime: number | undefined;
  roleContext: SupportRoleContext;
}): TicketCloseAuthorizationResult {
  const { actorAddress, actorName, targetOwner, operationQdnCreatedTime, roleContext } = input;

  if (!actorAddress) {
    return { authorized: false, reason: 'empty-wallet' };
  }

  if (
    targetOwner.resourceFamily === 'qucp-support-ticket' &&
    targetOwner.entityId &&
    actorAddress === targetOwner.ownerAddress
  ) {
    if (actorName && targetOwner.ownerName && actorName !== targetOwner.ownerName) {
      return {
        authorized: false,
        reason: 'author-name-mismatch',
        detail: 'Actor name does not match the ticket author name.',
      };
    }
    return { authorized: true, source: 'author' };
  }

  if (actorAddress === QUC_SYSOP_ADDRESS) {
    return { authorized: true, source: 'sysop-trust-anchor' };
  }

  const historical = verifyCategoryHistoricalAuthorization({
    publisherWallet: actorAddress,
    categoryQdnCreatedTime: operationQdnCreatedTime,
    roleSnapshots: roleContext.roleSnapshots,
    roleHistoryComplete: roleContext.roleHistoryComplete,
    roleLineageValid: roleContext.roleLineageValid,
    roleLineageStatus: roleContext.roleLineageStatus,
  });

  if (!historical.authorized) {
    return {
      authorized: false,
      reason:
        historical.reason === 'category-timestamp-missing'
          ? 'operation-timestamp-missing'
          : historical.reason,
      detail: historical.detail,
    };
  }

  return {
    authorized: true,
    source: 'admin-at-publication',
    snapshotEntityId: historical.snapshotEntityId,
  };
}

// ---- Effective State Reduction ----

export interface EffectiveSupportTicketStatus {
  status: 'Open' | 'Closed';
  authorized: boolean;
  /** Earliest authorized close operation (the permanent-close boundary). */
  operation?: QdnResourceEnvelope<QucpSupportTicketStatus>;
  /**
   * Trusted QDN publication time of the first authorized close operation.
   * Any ticket reply whose trusted QDN time is strictly after this value must
   * be rejected/quarantined on read.
   */
  firstCloseQdnTime?: number;
}

/**
 * Reduce validated close operations for a single ticket.
 *
 * Any authorized close operation closes the ticket. There is no reopen
 * action; once closed, the effective state remains Closed.
 */
export function reduceSupportTicketStatuses(
  targetOwner: SupportTicketTargetOwner,
  operations: QdnResourceEnvelope<QucpSupportTicketStatus>[],
  roleContext: SupportRoleContext,
): EffectiveSupportTicketStatus {
  const authorized = operations
    .filter((op) => op.data.targetFamily === targetOwner.resourceFamily)
    .filter((op) => op.data.targetEntityId === targetOwner.entityId)
    .filter((op) => op.data.action === 'close')
    .filter((op) => {
      const auth = authorizeSupportTicketCloseActor({
        actorAddress: op.data.actorAddress,
        actorName: op.data.actorName,
        targetOwner,
        operationQdnCreatedTime: op.metadata.created,
        roleContext,
      });
      return auth.authorized;
    })
    // Earliest first: the first authorized close is the authoritative boundary.
    .sort((a, b) => (a.metadata.created ?? 0) - (b.metadata.created ?? 0));

  if (authorized.length === 0) {
    return { status: 'Open', authorized: false };
  }

  const firstClose = authorized[0];
  return {
    status: 'Closed',
    authorized: true,
    operation: firstClose,
    firstCloseQdnTime: firstClose.metadata.created,
  };
}

// ---- Close Boundary ----

export interface SupportTicketCloseBoundary {
  status: 'Open' | 'Closed';
  /** Trusted QDN publication time of the first authorized close, if closed. */
  firstCloseQdnTime?: number;
  /**
   * Whether status discovery was complete enough to trust this boundary.
   * Callers must treat incomplete discovery as unable to prove that a reply is
   * pre-close, and therefore must not accept replies as post-close-safe.
   */
  discoveryComplete: boolean;
}

/**
 * Resolve the close boundary for one ticket from validated close operations.
 * Callers supply discovery completeness separately because the operation list
 * alone cannot distinguish "no closes" from "not all closes discovered".
 */
export function reduceSupportTicketCloseBoundary(
  targetOwner: SupportTicketTargetOwner,
  operations: QdnResourceEnvelope<QucpSupportTicketStatus>[],
  roleContext: SupportRoleContext,
  discoveryComplete: boolean,
): SupportTicketCloseBoundary {
  const effective = reduceSupportTicketStatuses(targetOwner, operations, roleContext);
  if (effective.status !== 'Closed') {
    return { status: 'Open', discoveryComplete };
  }
  return {
    status: 'Closed',
    firstCloseQdnTime: effective.firstCloseQdnTime,
    discoveryComplete,
  };
}

// ---- Reply Close-Boundary Decision ----

export type TicketReplyCloseDecision =
  | { accepted: true }
  | {
      accepted: false;
      reason:
        | 'status-discovery-incomplete'
        | 'reply-time-missing'
        | 'close-time-missing'
        | 'reply-after-close';
    };

/**
 * Authoritative read-side decision for a ticket reply relative to the
 * permanent-close boundary. A reply is rejected/quarantined when its trusted
 * QDN publication time is strictly after the first authorized close, or when
 * the close boundary cannot be proven (incomplete discovery / missing trusted
 * timestamps).
 */
export function evaluateTicketReplyAgainstClose(
  boundary: SupportTicketCloseBoundary,
  replyQdnTime: number | undefined,
): TicketReplyCloseDecision {
  if (!boundary.discoveryComplete) {
    return { accepted: false, reason: 'status-discovery-incomplete' };
  }

  if (boundary.status !== 'Closed') {
    return { accepted: true };
  }

  if (typeof replyQdnTime !== 'number') {
    return { accepted: false, reason: 'reply-time-missing' };
  }

  if (typeof boundary.firstCloseQdnTime !== 'number') {
    return { accepted: false, reason: 'close-time-missing' };
  }

  if (replyQdnTime > boundary.firstCloseQdnTime) {
    return { accepted: false, reason: 'reply-after-close' };
  }

  return { accepted: true };
}

// ---- Query Function ----

export async function querySupportTicketStatuses(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
): Promise<SupportTicketStatusQueryResult> {
  const diagnostics: RuntimeDiagnostic[] = [];

  const searchResult = await paginatedQdnSearch(searchFn, {
    service: 'DOCUMENT',
    identifier: SUPPORT_TICKET_STATUS_SEARCH_PREFIX,
    prefix: true,
    pageSize: 50,
    safetyMax: 500,
    reverse: true,
    includeMetadata: true,
  });

  if (
    searchResult.reason === 'request-failed' ||
    searchResult.reason === 'invalid-response' ||
    searchResult.reason === 'timeout'
  ) {
    diagnostics.push({
      level: 'error',
      code: 'SUPPORT_TICKET_STATUS_SEARCH_FAILED',
      message: `Support ticket status search failed: ${searchResult.reason}`,
    });
    return {
      status: 'unavailable',
      items: [],
      reason: `Support ticket status search failed: ${searchResult.reason}`,
      diagnostics,
    };
  }

  if (searchResult.items.length === 0) {
    if (searchResult.complete) {
      return { status: 'empty', items: [], diagnostics: [] };
    }
    return {
      status: 'incomplete',
      items: [],
      rejectedCount: 0,
      quarantinedCount: 0,
      reason: searchResult.reason ?? 'Incomplete support ticket status discovery',
      diagnostics: searchResult.diagnostics.map((d) => ({
        level: d.level,
        code: d.code,
        message: d.message,
      })),
    };
  }

  for (const d of searchResult.diagnostics) {
    diagnostics.push({
      level: d.level,
      code: d.code,
      message: d.message,
      entityId: d.identifier,
      publisherName: d.name,
    });
  }

  const fetchResult = await boundedFetchResources<QucpSupportTicketStatus>(
    fetchFn,
    parseSupportTicketStatusPayload,
    searchResult.items,
  );

  for (const d of fetchResult.diagnostics) {
    diagnostics.push({
      level: d.level,
      code: d.code,
      message: d.message,
      entityId: d.identifier,
      publisherName: d.name,
    });
  }

  const items: ValidatedSupportTicketStatus[] = [];
  let rejectedCount = 0;
  let quarantinedCount = 0;
  let identityLookupFailedCount = 0;

  for (const envelope of fetchResult.items) {
    const result = await validateResource(
      envelope,
      supportTicketStatusPolicy,
      identityResolver,
    );

    if (result.status === 'accepted') {
      items.push({
        envelope: result.envelope,
        entityId: result.envelope.data.operationId,
        publisherName: result.envelope.metadata.name,
        publisherAddress:
          result.envelope.resolvedPublisherAddress ??
          result.envelope.data.actorAddress,
      });
      continue;
    }

    if (result.status === 'rejected') {
      rejectedCount++;
    } else {
      quarantinedCount++;
      if (result.reason === ValidationReasonCodes.PUBLISHER_LOOKUP_FAILED) {
        identityLookupFailedCount++;
      }
    }

    for (const d of result.diagnostics) {
      diagnostics.push({
        level: d.level,
        code: d.code,
        message: d.message,
        entityId: d.identifier,
        publisherName: d.name,
      });
    }
  }

  const searchComplete = searchResult.complete;
  const fetchComplete = fetchResult.complete;
  const allFetchesFailed =
    searchResult.items.length > 0 &&
    fetchResult.items.length === 0 &&
    !fetchComplete;

  return classifyRuntimeQuery({
    items,
    rejectedCount,
    quarantinedCount,
    identityLookupFailedCount,
    searchComplete,
    searchReason: searchResult.reason,
    fetchComplete,
    allFetchesFailed,
    diagnostics,
  });
}

// ---- Payload Parser ----

function parseSupportTicketStatusPayload(raw: unknown): QucpSupportTicketStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-support-ticket-status') return null;
  return d as QucpSupportTicketStatus;
}
