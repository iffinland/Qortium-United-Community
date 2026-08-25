// ===== Support RTK Query API =====
//
// Migrated to publisher-aware validated QDN runtime.
// Tickets: qucp-support-ticket-*, Replies: qucp-ticket-reply-*, Categories: qucp-support-category-*
//
// Category mutations require Admin/SysOp role authority (verified via role precheck).
// Ticket creation validates categoryId against accepted active categories.

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { publishJsonResource } from '../../services/qortium/qdnService';
import { buildQucpIdentifier } from '../../services/qdn/identifiers/qucpIdentifiers';
import { buildSupportTicketCloseIdentifier } from '../../services/qdn/identifiers/operationIdentifiers';
import {
  fetchValidatedSupportTickets,
  fetchValidatedTicketReplies,
  fetchValidatedSupportCategories,
  fetchValidatedSupportTicketStatuses,
  fetchValidatedRoleSnapshots,
  getCachedRoleSnapshot,
  buildSupportTicketPayload,
  buildTicketReplyPayload,
  buildSupportCategoryPayload,
  buildSupportTicketClosePayload,
  buildSupportRoleContext,
  reduceSupportTicketStatuses,
  reduceSupportTicketCloseBoundary,
  evaluateTicketReplyAgainstClose,
  authorizeSupportTicketCloseActor,
} from '../../services/qdn/runtime/qdnRuntimeService';
import { applyCategoryHistoricalAuthorization } from '../../services/qdn/runtime/supportRuntime';
import type { SupportCategoryQueryResult } from '../../services/qdn/runtime/supportRuntime';
import type {
  SupportRoleContext,
  SupportTicketTargetOwner,
  SupportTicketCloseBoundary,
} from '../../services/qdn/runtime/supportTicketStatusRuntime';
import type { ValidatedResource } from '../../services/qdn/runtime/runtimeTypes';
import type { QueryCompleteness } from '../../services/qdn/runtime/runtimeTypes';
import { warningDiag, type QdnDiagnostic } from '../../services/qdn/diagnostics';
import { assertSupportCategoryManagerAuthority } from '../../services/qdn/roles/supportCategoryAuth';
import { QUC_SYSOP_ADDRESS } from '../../config/qortiumTrust';
import {
  validateTicketCategoryForCreation,
  categoryRejectionDiagnostic,
  type TicketCategoryValidation,
} from '../../services/qdn/runtime/ticketCategoryValidation';
import type { QucpSupportTicket } from '../../services/qdn/schemas/supportTicketSchema';
import type { QucpTicketReply } from '../../services/qdn/schemas/ticketReplySchema';
import type { QucpSupportCategory } from '../../services/qdn/schemas/supportCategorySchema';
import type { QucpSupportTicketStatus } from '../../services/qdn/schemas/supportTicketStatusSchema';
import type { Ticket, TicketResponse, SupportCategory, TicketStatus } from '../../types/support';
import { store as appStore } from '../../store';

// ---- Result types ----

export interface SupportBoardResult {
  tickets: Ticket[];
  categories: SupportCategory[];
  completeness: QueryCompleteness;
  diagnostics: readonly QdnDiagnostic[];
}

export interface TicketDetailResult {
  ticket: Ticket | null;
  completeness: QueryCompleteness;
  diagnostics: readonly QdnDiagnostic[];
}

export interface CategoryListResult {
  categories: SupportCategory[];
  completeness: QueryCompleteness;
}

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
};

// ---- Typed View-Model Mappers ----

function toTicketView(
  env: ValidatedResource<QucpSupportTicket>,
  categories: SupportCategory[],
): Ticket {
  const d = env.envelope.data;
  const meta = env.envelope.metadata;
  const catId = d.categoryId ?? '';
  const hasTimestamp = typeof meta.created === 'number';
  return {
    id: env.entityId,
    title: d.title ?? '',
    description: d.description ?? '',
    type: d.type as Ticket['type'] ?? 'general',
    categoryId: catId,
    categoryName: categories.find(c => c.id === catId)?.name,
    authorName: env.publisherName,
    authorAddress: env.publisherAddress,
    createdAt: hasTimestamp ? new Date(meta.created!).toISOString() : '',
    updatedAt: typeof meta.updated === 'number' ? new Date(meta.updated!).toISOString() : undefined,
    timestampFromQdn: hasTimestamp || undefined,
    status: 'Open' as TicketStatus,
    responses: [],
  };
}

function toReplyView(
  r: ValidatedResource<QucpTicketReply>,
): TicketResponse {
  const d = r.envelope.data;
  const meta = r.envelope.metadata;
  const hasTimestamp = typeof meta.created === 'number';
  return {
    id: r.entityId,
    ticketId: d.parentEntityId ?? '',
    authorName: r.publisherName,
    authorAddress: r.publisherAddress,
    content: d.content ?? '',
    createdAt: hasTimestamp ? new Date(meta.created!).toISOString() : '',
  };
}

function toCategoryView(
  c: ValidatedResource<QucpSupportCategory>,
): SupportCategory {
  const d = c.envelope.data;
  return {
    id: c.entityId,
    name: d.name,
    description: d.description,
    isActive: d.isActive,
    sortOrder: d.sortOrder,
  };
}

/**
 * Deterministic support-category ordering.
 *
 * Primary: numeric `sortOrder` (undefined treated as 0).
 * Secondary: case-insensitive `name`, then `id`, so equal values have a stable
 * order independent of QDN search/reduction input order.
 */
export function sortSupportCategories(categories: SupportCategory[]): SupportCategory[] {
  return [...categories].sort((a, b) => {
    const aOrder = Number.isFinite(a.sortOrder) ? (a.sortOrder as number) : 0;
    const bOrder = Number.isFinite(b.sortOrder) ? (b.sortOrder as number) : 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const nameOrder = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (nameOrder !== 0) return nameOrder;
    return a.id.localeCompare(b.id);
  });
}

// ---- Category Authority Precheck ----

async function requireCategoryManagerAuthority(ownerAddress: string): Promise<void> {
  await fetchValidatedRoleSnapshots();
  const snapshot = getCachedRoleSnapshot();
  const auth = assertSupportCategoryManagerAuthority(ownerAddress, snapshot);
  if (!auth.authorized) {
    throw new Error(
      auth.detail ?? `Category management requires Admin or SysOp role (${auth.reason})`,
    );
  }
}

// ---- Authorized Category Fetch (with historical authorization) ----

async function fetchAuthorizedCategories(
  roleContext?: SupportRoleContext,
): Promise<SupportCategoryQueryResult> {
  const catResult = await fetchValidatedSupportCategories();

  const ctx = roleContext ?? buildSupportRoleContext(await fetchValidatedRoleSnapshots());

  return applyCategoryHistoricalAuthorization(
    catResult,
    ctx.roleHistoryUnavailable ? [] : ctx.roleSnapshots,
    ctx.roleHistoryComplete,
    ctx.roleLineageValid,
    ctx.roleLineageStatus ?? (ctx.roleHistoryUnavailable ? 'Role history unavailable' : undefined),
  );
}

async function fetchSupportRoleContext(): Promise<SupportRoleContext> {
  return buildSupportRoleContext(await fetchValidatedRoleSnapshots());
}

function toTicketTargetOwner(ticket: ValidatedResource<QucpSupportTicket>): SupportTicketTargetOwner {
  return {
    ownerName: ticket.envelope.data.ownerName,
    ownerAddress: ticket.publisherAddress,
    entityId: ticket.entityId,
    resourceFamily: 'qucp-support-ticket',
  };
}

function applyTicketStatuses(
  ticket: Ticket,
  found: ValidatedResource<QucpSupportTicket>,
  statusResult: Awaited<ReturnType<typeof fetchValidatedSupportTicketStatuses>>,
  roleContext: SupportRoleContext,
): void {
  const operations =
    statusResult.status === 'unavailable' || statusResult.status === 'empty'
      ? []
      : statusResult.items.map((item) => item.envelope);

  const reduced = reduceSupportTicketStatuses(
    toTicketTargetOwner(found),
    operations,
    roleContext,
  );

  ticket.status = reduced.status;
  if (reduced.operation) {
    const op = reduced.operation.data;
    ticket.closedAt = op.createdAt
      ? new Date(op.createdAt).toISOString()
      : new Date(reduced.operation.metadata.created ?? Date.now()).toISOString();
    ticket.closedBy = op.actorName;
  }
}

interface ResolvedCloseBoundary {
  boundary: SupportTicketCloseBoundary;
  roleDegraded: boolean;
  hasRoleDependentClose: boolean;
}

/**
 * Resolve the authoritative close boundary for a ticket from validated close
 * operations, including the role-history dependency.
 *
 * `discoveryComplete` is false when status discovery is incomplete/unavailable,
 * or when role authority is degraded and at least one close operation is
 * role-dependent (not the ticket author and not the SysOp trust anchor). In
 * that degraded case the reader cannot prove a reply predates a possible
 * Admin-authorized close, so replies must fail truthfully/quarantine.
 */

function resolveCloseBoundary(
  found: ValidatedResource<QucpSupportTicket>,
  statusResult: Awaited<ReturnType<typeof fetchValidatedSupportTicketStatuses>>,
  roleContext: SupportRoleContext,
): ResolvedCloseBoundary {
  const targetOwner = toTicketTargetOwner(found);
  const operations =
    statusResult.status === 'unavailable' || statusResult.status === 'empty'
      ? []
      : statusResult.items.map((item) => item.envelope);
  const statusDiscoveryComplete =
    statusResult.status === 'complete' || statusResult.status === 'empty';
  const roleDegraded = supportRoleAuthorityDegraded(roleContext);
  const hasRoleDependentClose = hasSupportRoleDependentClose(targetOwner, operations);
  const discoveryComplete =
    statusDiscoveryComplete && !(roleDegraded && hasRoleDependentClose);

  return {
    boundary: reduceSupportTicketCloseBoundary(
      targetOwner,
      operations,
      roleContext,
      discoveryComplete,
    ),
    roleDegraded,
    hasRoleDependentClose,
  };
}

function supportRoleAuthorityDegraded(roleContext: SupportRoleContext): boolean {
  return (
    roleContext.roleHistoryUnavailable ||
    !roleContext.roleHistoryComplete ||
    !roleContext.roleLineageValid
  );
}

function hasSupportRoleDependentClose(
  targetOwner: SupportTicketTargetOwner,
  operations: Array<{ data: QucpSupportTicketStatus }>,
): boolean {
  return operations.some(
    (op) =>
      op.data.action === 'close' &&
      op.data.targetFamily === targetOwner.resourceFamily &&
      op.data.targetEntityId === targetOwner.entityId &&
      op.data.actorAddress !== targetOwner.ownerAddress &&
      op.data.actorAddress !== QUC_SYSOP_ADDRESS,
  );
}

interface SupportActorIdentity {
  name: string | null;
  address: string | null;
  role: string;
}

function resolveSupportActorIdentity(): SupportActorIdentity {
  const state = appStore.getState();
  return {
    name: state.auth.name,
    address: state.auth.address,
    role: state.auth.role,
  };
}

// ---- API Definition ----

export const supportApi = createApi({
  reducerPath: 'supportApi',
  baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['Tickets', 'TicketReplies', 'SupportCategories'],
  endpoints: (builder) => ({
    // ===== CATEGORIES =====
    getCategories: builder.query<CategoryListResult, void>({
      queryFn: () => queryFn(async () => {
        const r = await fetchAuthorizedCategories();
        if (r.status === 'unavailable') throw new Error('Support categories unavailable.');
        return {
          categories: sortSupportCategories(r.items.map(toCategoryView)),
          completeness: r.status,
        };
      }),
      providesTags: ['SupportCategories'],
    }),

    // ===== TICKET BOARD =====
    getTickets: builder.query<SupportBoardResult, string | void>({
      queryFn: (catFilter) => queryFn(async () => {
        const roleContext = await fetchSupportRoleContext();
        const [ticketR, catR, statusR] = await Promise.all([
          fetchValidatedSupportTickets(),
          fetchAuthorizedCategories(roleContext),
          fetchValidatedSupportTicketStatuses(),
        ]);
        if (ticketR.status === 'unavailable') throw new Error('Support tickets unavailable.');
        const categories: SupportCategory[] = catR.status !== 'unavailable'
          ? sortSupportCategories(catR.items.map(toCategoryView))
          : [];
        let tickets = ticketR.items.map((t) => {
          const view = toTicketView(t, categories);
          applyTicketStatuses(view, t, statusR, roleContext);
          const { roleDegraded, hasRoleDependentClose, boundary } =
            resolveCloseBoundary(t, statusR, roleContext);
          view.closeBoundaryDegraded =
            roleDegraded && hasRoleDependentClose && boundary.status !== 'Closed';
          return view;
        });
        if (catFilter) tickets = tickets.filter(t => t.categoryId === catFilter);
        const ticketComplete = ticketR.status === 'complete' || ticketR.status === 'empty';
        const catComplete = catR.status === 'complete' || catR.status === 'empty';
        const statusComplete = statusR.status === 'complete' || statusR.status === 'empty';
        const completeness = ticketComplete && catComplete && statusComplete
          ? 'complete' as const : 'incomplete' as const;
        return {
          tickets,
          categories,
          completeness,
          diagnostics: [
            ...(ticketR.diagnostics ?? []),
            ...(catR.diagnostics ?? []),
            ...(statusR.diagnostics ?? []),
          ],
        };
      }),
      providesTags: ['Tickets', 'SupportCategories'],
    }),

    // ===== TICKET DETAIL =====
    getTicket: builder.query<TicketDetailResult, string>({
      queryFn: (ticketId) => queryFn(async () => {
        const roleContext = await fetchSupportRoleContext();
        const [ticketR, replyR, catR, statusR] = await Promise.all([
          fetchValidatedSupportTickets(),
          fetchValidatedTicketReplies(),
          fetchAuthorizedCategories(roleContext),
          fetchValidatedSupportTicketStatuses(),
        ]);
        if (ticketR.status === 'unavailable') throw new Error('Support unavailable.');
        const categories: SupportCategory[] = catR.status !== 'unavailable'
          ? sortSupportCategories(catR.items.map(toCategoryView))
          : [];
        const found = ticketR.items.find((t) => t.entityId === ticketId);
        if (!found) {
          // Distinguish: incomplete discovery vs definitive not-found
          if (ticketR.status === 'incomplete') {
            throw new Error('Ticket not found in incomplete results. Try again when discovery completes.');
          }
          throw new Error('Ticket not found.');
        }
        const ticket = toTicketView(found, categories);
        applyTicketStatuses(ticket, found, statusR, roleContext);
        const {
          boundary: closeBoundary,
          roleDegraded,
          hasRoleDependentClose,
        } = resolveCloseBoundary(found, statusR, roleContext);
        ticket.closeBoundaryDegraded =
          roleDegraded && hasRoleDependentClose && closeBoundary.status !== 'Closed';
        const acceptedTicketIds = new Set(ticketR.items.map((t) => t.entityId));
        const allDiags: QdnDiagnostic[] = [
          ...(ticketR.diagnostics ?? []),
          ...(replyR.diagnostics ?? []),
          ...(catR.diagnostics ?? []),
          ...(statusR.diagnostics ?? []),
        ];
        if (replyR.status !== 'unavailable') {
          for (const r of replyR.items) {
            const pid = r.envelope.data.parentEntityId;
            if (!pid || !acceptedTicketIds.has(pid)) {
              allDiags.push(warningDiag(
                'ticket-reply-parent-not-accepted',
                `Reply ${r.entityId} parent ${pid ?? 'missing'} not accepted`,
              ));
              continue;
            }
            if (pid !== ticketId) continue;

            // H6 permanent-close boundary: never display a reply whose trusted
            // QDN publication time is after the first authorized close. If the
            // close state cannot be determined reliably, fail truthfully.
            const closeDecision = evaluateTicketReplyAgainstClose(
              closeBoundary,
              r.envelope.metadata.created,
            );
            if (!closeDecision.accepted) {
              const code =
                closeDecision.reason === 'status-discovery-incomplete'
                  ? 'ticket-reply-close-boundary-incomplete'
                  : closeDecision.reason === 'reply-after-close'
                    ? 'ticket-reply-after-close'
                    : 'ticket-reply-close-time-missing';
              allDiags.push(warningDiag(
                code,
                `Reply ${r.entityId} quarantined: ${closeDecision.reason}`,
              ));
              continue;
            }

            ticket.responses.push(toReplyView(r));
          }
        }
        const ticketComplete = ticketR.status === 'complete' || ticketR.status === 'empty';
        const replyComplete = replyR.status === 'complete' || replyR.status === 'empty';
        const catComplete = catR.status === 'complete' || catR.status === 'empty';
        const statusComplete = statusR.status === 'complete' || statusR.status === 'empty';
        const comp = ticketComplete && replyComplete && catComplete && statusComplete && !ticket.closeBoundaryDegraded
          ? 'complete' as const : 'incomplete' as const;
        return { ticket, completeness: comp, diagnostics: allDiags };
      }),
      providesTags: (_r, _e, ticketId) => [{ type: 'Tickets', id: ticketId }, 'TicketReplies'],
    }),

    // ===== CREATE TICKET (with category validation) =====
    createTicket: builder.mutation<Ticket, { title: string; description: string; type?: Ticket['type']; categoryId: string; authorName: string; authorAddress: string }>({
      queryFn: async (input) => {
        try {
          // Validate category against historically authorized categories
          const catR = await fetchAuthorizedCategories();
          const validation = validateTicketCategoryForCreation(input.categoryId, catR);
          if (!validation.valid) {
            const diag = categoryRejectionDiagnostic(validation.reason, input.categoryId, validation.detail);
            return { error: diag.message };
          }

          const entityId = `st-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const payload = buildSupportTicketPayload({
            entityId,
            title: input.title,
            description: input.description,
            type: input.type ?? 'general',
            categoryId: input.categoryId,
            ownerName: input.authorName,
            ownerAddress: input.authorAddress,
          });
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier: buildQucpIdentifier('qucp-support-ticket', entityId),
            payload,
            title: input.title,
            filename: `${entityId}.json`,
          });
          return {
            data: {
              id: entityId,
              title: input.title,
              description: input.description,
              type: input.type ?? 'general',
              categoryId: input.categoryId,
              categoryName: validation.valid ? validation.categoryName : undefined,
              authorName: input.authorName,
              authorAddress: input.authorAddress,
              createdAt: new Date().toISOString(),
              timestampFromQdn: true,
              status: 'Open' as TicketStatus,
              responses: [],
            },
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed.' };
        }
      },
      invalidatesTags: ['Tickets'],
    }),

    // ===== CATEGORY MUTATIONS (with role precheck) =====
    createCategory: builder.mutation<SupportCategory, { name: string; description?: string; sortOrder?: number; ownerName: string; ownerAddress: string }>({
      queryFn: async (input) => {
        try {
          await requireCategoryManagerAuthority(input.ownerAddress);
          const entityId = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const payload = buildSupportCategoryPayload({
            entityId,
            name: input.name,
            description: input.description,
            isActive: true,
            sortOrder: input.sortOrder,
            ownerName: input.ownerName,
            ownerAddress: input.ownerAddress,
          });
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier: buildQucpIdentifier('qucp-support-category', entityId),
            payload,
            title: input.name,
            filename: `${entityId}.json`,
          });
          return { data: { id: entityId, name: input.name, description: input.description, isActive: true, sortOrder: input.sortOrder } };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed.' };
        }
      },
      invalidatesTags: ['SupportCategories'],
    }),

    updateCategory: builder.mutation<SupportCategory, { id: string; name: string; description?: string; isActive: boolean; sortOrder?: number; ownerName: string; ownerAddress: string }>({
      queryFn: async (input) => {
        try {
          await requireCategoryManagerAuthority(input.ownerAddress);
          const payload = buildSupportCategoryPayload({
            entityId: input.id,
            name: input.name,
            description: input.description,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            ownerName: input.ownerName,
            ownerAddress: input.ownerAddress,
          });
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier: buildQucpIdentifier('qucp-support-category', input.id),
            payload,
            title: input.name,
            filename: `${input.id}.json`,
          });
          return { data: { id: input.id, name: input.name, description: input.description, isActive: input.isActive, sortOrder: input.sortOrder } };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed.' };
        }
      },
      invalidatesTags: ['SupportCategories', 'Tickets'],
    }),

    // ===== CLOSE TICKET =====
    closeTicket: builder.mutation<Ticket, { ticketId: string }>({
      queryFn: async ({ ticketId }) => {
        try {
          const identity = resolveSupportActorIdentity();
          if (!identity.address) {
            return { error: 'Publisher identity not available.' };
          }

          const [roleContext, ticketR, statusR] = await Promise.all([
            fetchSupportRoleContext(),
            fetchValidatedSupportTickets(),
            fetchValidatedSupportTicketStatuses(),
          ]);

          if (ticketR.status === 'unavailable') {
            return { error: 'Support tickets are currently unavailable.' };
          }

          const found = ticketR.items.find((t) => t.entityId === ticketId);
          if (!found) {
            return {
              error:
                ticketR.status === 'incomplete'
                  ? 'Ticket not found in incomplete results. Try again when discovery completes.'
                  : 'Ticket not found.',
            };
          }

          const targetOwner = toTicketTargetOwner(found);
          const currentStatus = reduceSupportTicketStatuses(
            targetOwner,
            statusR.status === 'unavailable' || statusR.status === 'empty'
              ? []
              : statusR.items.map((item) => item.envelope),
            roleContext,
          );

          if (currentStatus.status === 'Closed') {
            return { error: 'Ticket is already closed.' };
          }

          const auth = authorizeSupportTicketCloseActor({
            actorAddress: identity.address,
            actorName: identity.name ?? undefined,
            targetOwner,
            operationQdnCreatedTime: Date.now(),
            roleContext,
          });

          if (!auth.authorized) {
            return {
              error: auth.detail ?? `Not authorized to close this ticket (${auth.reason}).`,
            };
          }

          const operationId = `stc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const payload = buildSupportTicketClosePayload({
            operationId,
            targetEntityId: ticketId,
            actorName: identity.name ?? 'Unknown',
            actorAddress: identity.address,
          });
          const identifier = await buildSupportTicketCloseIdentifier(
            'qucp-support-ticket',
            ticketId,
            identity.address,
          );

          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: `Close support ticket ${ticketId}`,
            filename: `${operationId}.json`,
          });

          const closedAt = new Date().toISOString();
          return {
            data: {
              ...toTicketView(found, []),
              status: 'Closed' as TicketStatus,
              closedAt,
              closedBy: identity.name ?? identity.address,
            },
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to close ticket.' };
        }
      },
      invalidatesTags: (_r, _e, { ticketId }) => [{ type: 'Tickets', id: ticketId }],
    }),

    // ===== ADD REPLY =====
    addResponse: builder.mutation<TicketResponse, { ticketId: string; content: string; authorName: string; authorAddress: string }>({
      queryFn: async (input) => {
        try {
          const [roleContext, ticketR, statusR] = await Promise.all([
            fetchSupportRoleContext(),
            fetchValidatedSupportTickets(),
            fetchValidatedSupportTicketStatuses(),
          ]);

          if (ticketR.status === 'unavailable') {
            return { error: 'Support tickets are currently unavailable.' };
          }

          if (statusR.status === 'unavailable') {
            return { error: 'Support ticket status is currently unavailable.' };
          }

          if (statusR.status === 'incomplete') {
            return {
              error: 'Ticket status history is incomplete; cannot safely post a reply.',
            };
          }

          const found = ticketR.items.find((t) => t.entityId === input.ticketId);
          if (!found) {
            return {
              error:
                ticketR.status === 'incomplete'
                  ? 'Ticket not found in incomplete results. Try again when discovery completes.'
                  : 'Ticket not found.',
            };
          }

          const { boundary } = resolveCloseBoundary(found, statusR, roleContext);

          if (boundary.status === 'Closed') {
            return { error: 'Cannot reply to a closed ticket.' };
          }
          if (!boundary.discoveryComplete) {
            return {
              error: 'Ticket close state is uncertain; cannot safely post a reply.',
            };
          }

          const entityId = `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const payload = buildTicketReplyPayload({
            entityId,
            parentEntityId: input.ticketId,
            content: input.content,
            ownerName: input.authorName,
            ownerAddress: input.authorAddress,
          });
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier: buildQucpIdentifier('qucp-ticket-reply', entityId),
            payload,
            title: `Reply to ${input.ticketId}`,
            filename: `${entityId}.json`,
          });
          return {
            data: {
              id: entityId,
              ticketId: input.ticketId,
              authorName: input.authorName,
              authorAddress: input.authorAddress,
              content: input.content,
              createdAt: new Date().toISOString(),
            },
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed.' };
        }
      },
      invalidatesTags: (_r, _e, { ticketId }) => [{ type: 'Tickets', id: ticketId }, 'TicketReplies'],
    }),
  }),
});

export const {
  useGetCategoriesQuery,
  useGetTicketsQuery,
  useGetTicketQuery,
  useCreateTicketMutation,
  useCloseTicketMutation,
  useAddResponseMutation,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
} = supportApi;

// Re-export for UI completeness awareness
export type { TicketCategoryValidation };
