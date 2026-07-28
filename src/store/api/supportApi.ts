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
import {
  fetchValidatedSupportTickets,
  fetchValidatedTicketReplies,
  fetchValidatedSupportCategories,
  fetchValidatedRoleSnapshots,
  getCachedRoleSnapshot,
  buildSupportTicketPayload,
  buildTicketReplyPayload,
  buildSupportCategoryPayload,
} from '../../services/qdn/runtime/qdnRuntimeService';
import { applyCategoryHistoricalAuthorization } from '../../services/qdn/runtime/supportRuntime';
import { detectForks } from '../../services/qdn/roles/registryLineage';
import type { QdnResourceEnvelope } from '../../services/qdn/QdnResourceEnvelope';
import type { QucpRoleRegistrySnapshot } from '../../services/qdn/schemas/roleRegistrySnapshotSchema';
import type { SupportCategoryQueryResult } from '../../services/qdn/runtime/supportRuntime';
import type { ValidatedResource } from '../../services/qdn/runtime/runtimeTypes';
import type { QueryCompleteness } from '../../services/qdn/runtime/runtimeTypes';
import { warningDiag, type QdnDiagnostic } from '../../services/qdn/diagnostics';
import { assertSupportCategoryManagerAuthority } from '../../services/qdn/roles/supportCategoryAuth';
import {
  validateTicketCategoryForCreation,
  categoryRejectionDiagnostic,
  type TicketCategoryValidation,
} from '../../services/qdn/runtime/ticketCategoryValidation';
import type { QucpSupportTicket } from '../../services/qdn/schemas/supportTicketSchema';
import type { QucpTicketReply } from '../../services/qdn/schemas/ticketReplySchema';
import type { QucpSupportCategory } from '../../services/qdn/schemas/supportCategorySchema';
import type { Ticket, TicketResponse, SupportCategory } from '../../types/support';

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

async function fetchAuthorizedCategories(): Promise<SupportCategoryQueryResult> {
  const catResult = await fetchValidatedSupportCategories();

  // Fetch role snapshots for historical authorization
  const roleResult = await fetchValidatedRoleSnapshots();

  if (roleResult.status === 'unavailable') {
    // Role history unavailable — only SysOp-published categories can pass
    // (SysOp passes without role snapshot check)
    return applyCategoryHistoricalAuthorization(catResult, [], false, false, 'Role history unavailable');
  }

  // Build snapshot map for lineage validation
  const snapshotMap = new Map<string, { snapshot: QucpRoleRegistrySnapshot; identifier: string }>();
  const roleSnapshots: Array<{ envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>; snapshotEntityId: string }> = [];

  for (const item of roleResult.items) {
    const snap = item.envelope.data;
    snapshotMap.set(snap.snapshotId, { snapshot: snap, identifier: item.envelope.metadata.identifier });
    roleSnapshots.push({
      envelope: item.envelope as QdnResourceEnvelope<QucpRoleRegistrySnapshot>,
      snapshotEntityId: snap.snapshotId,
    });
  }

  // Check lineage
  const forks = detectForks(snapshotMap);
  const roleLineageValid = forks.size === 0;
  const roleHistoryComplete = roleResult.status === 'complete';

  return applyCategoryHistoricalAuthorization(
    catResult,
    roleSnapshots,
    roleHistoryComplete,
    roleLineageValid,
    roleLineageValid ? undefined : `Forked role snapshot history: ${[...forks.keys()].join(', ')}`,
  );
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
          categories: r.items.map(toCategoryView),
          completeness: r.status,
        };
      }),
      providesTags: ['SupportCategories'],
    }),

    // ===== TICKET BOARD =====
    getTickets: builder.query<SupportBoardResult, string | void>({
      queryFn: (catFilter) => queryFn(async () => {
        const [ticketR, catR] = await Promise.all([
          fetchValidatedSupportTickets(),
          fetchAuthorizedCategories(),
        ]);
        if (ticketR.status === 'unavailable') throw new Error('Support tickets unavailable.');
        const categories: SupportCategory[] = catR.status !== 'unavailable'
          ? catR.items.map(toCategoryView)
          : [];
        let tickets = ticketR.items.map((t) => toTicketView(t, categories));
        if (catFilter) tickets = tickets.filter(t => t.categoryId === catFilter);
        const completeness = ticketR.status === 'complete' && (catR.status === 'complete' || catR.status === 'empty')
          ? 'complete' as const : 'incomplete' as const;
        return {
          tickets,
          categories,
          completeness,
          diagnostics: [...(ticketR.diagnostics ?? []), ...(catR.diagnostics ?? [])],
        };
      }),
      providesTags: ['Tickets', 'SupportCategories'],
    }),

    // ===== TICKET DETAIL =====
    getTicket: builder.query<TicketDetailResult, string>({
      queryFn: (ticketId) => queryFn(async () => {
        const [ticketR, replyR, catR] = await Promise.all([
          fetchValidatedSupportTickets(),
          fetchValidatedTicketReplies(),
          fetchAuthorizedCategories(),
        ]);
        if (ticketR.status === 'unavailable') throw new Error('Support unavailable.');
        const categories: SupportCategory[] = catR.status !== 'unavailable'
          ? catR.items.map(toCategoryView)
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
        const acceptedTicketIds = new Set(ticketR.items.map((t) => t.entityId));
        const allDiags: QdnDiagnostic[] = [
          ...(ticketR.diagnostics ?? []),
          ...(replyR.diagnostics ?? []),
          ...(catR.diagnostics ?? []),
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
            ticket.responses.push(toReplyView(r));
          }
        }
        const comp = ticketR.status === 'complete' && (replyR.status === 'complete' || replyR.status === 'empty')
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

    // ===== ADD REPLY =====
    addResponse: builder.mutation<TicketResponse, { ticketId: string; content: string; authorName: string; authorAddress: string }>({
      queryFn: async (input) => {
        try {
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
  useAddResponseMutation,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
} = supportApi;

// Re-export for UI completeness awareness
export type { TicketCategoryValidation };
