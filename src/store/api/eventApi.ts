// ===== Events RTK Query API =====
//
// Canonical QDN-backed Events domain.
// Events: qucp-event-{entityId}.
//
// Temporal status (Upcoming/Ongoing/Past) is derived, never stored.
// Creation and management are admin-only and enforced in this API layer.

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { publishJsonResource } from '../../services/qortium/qdnService';
import { buildQucpIdentifier } from '../../services/qdn/identifiers/qucpIdentifiers';
import {
  fetchValidatedEvents,
  fetchValidatedEventByEntityId,
  buildEventCreatePayload,
  buildEventUpdatePayload,
  generateEventEntityId,
} from '../../services/qdn/runtime/qdnRuntimeService';
import type { QucpEvent, EventStatus } from '../../services/qdn/schemas/eventSchema';

// ---- View Model ----

export interface EventView {
  entityId: string;
  identifier: string;
  title: string;
  category: string;
  description: string;
  /** Display/dashboard-compatible ISO start timestamp. */
  startDate: string;
  /** Display ISO end timestamp (null when omitted). */
  endDate: string | null;
  /** Authoritative start epoch for status derivation. */
  startDateMs: number;
  /** Authoritative end epoch (null when omitted). */
  endDateMs: number | null;
  location: string | null;
  qdnUrl: string | null;
  ownerName: string;
  ownerAddress: string;
  createdAt: string;
  editedAt: string | null;
  status: EventStatus;
  revision: number;
  isOwner: boolean;
}

export type EventListStatus = 'complete' | 'incomplete' | 'unavailable' | 'empty';

export interface EventListResult {
  status: EventListStatus;
  events: EventView[];
  diagnostics: string[];
}

// ---- Helpers ----

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
};

interface ValidatedEventEnvelope {
  envelope: {
    data: Record<string, unknown>;
    metadata: { name: string; created?: number; updated?: number };
  };
  entityId: string;
  publisherName: string;
  publisherAddress: string;
}

function toEventView(env: ValidatedEventEnvelope, currentWallet: string): EventView {
  const d = env.envelope.data;
  const meta = env.envelope.metadata;
  const identifier = buildQucpIdentifier('qucp-event', env.entityId);
  const startDateMs = typeof d.startDate === 'number' ? d.startDate : 0;
  const endDateMs = typeof d.endDate === 'number' ? d.endDate : null;
  const createdAtMs = typeof meta.created === 'number'
    ? meta.created
    : typeof d.createdAt === 'number' ? d.createdAt : 0;

  return {
    entityId: env.entityId,
    identifier,
    title: (d.title as string) ?? '',
    category: (d.category as string) ?? '',
    description: (d.description as string) ?? '',
    startDate: startDateMs ? new Date(startDateMs).toISOString() : '',
    endDate: endDateMs ? new Date(endDateMs).toISOString() : null,
    startDateMs,
    endDateMs,
    location: (d.location as string) || null,
    qdnUrl: (d.qdnUrl as string) || null,
    ownerName: env.publisherName,
    ownerAddress: env.publisherAddress,
    createdAt: createdAtMs ? new Date(createdAtMs).toISOString() : '',
    editedAt: meta.updated ? new Date(meta.updated).toISOString() : null,
    status: (d.status === 'archived' ? 'archived' : 'active') as EventStatus,
    revision: typeof d.revision === 'number' ? d.revision : 1,
    isOwner: env.publisherAddress === currentWallet,
  };
}

// ---- Publisher Identity ----

import { store as appStore } from '../../store';

const EVENT_EDITOR_ROLES = new Set(['SysOp', 'Admin']);

interface PublisherIdentity {
  name: string;
  address: string;
  role: string;
}

function resolvePublisherIdentity(): PublisherIdentity | null {
  const state = appStore.getState();
  const name = state.auth?.name as string | null;
  const address = state.auth?.address as string | null;
  const role = state.auth?.role as string ?? 'User';
  if (!name || !address) return null;
  return { name, address, role };
}

function assertAuthorized(identity: PublisherIdentity | null, operation: string): { error?: string } {
  if (!identity) return { error: 'Publisher identity not available.' };
  if (!EVENT_EDITOR_ROLES.has(identity.role)) {
    return { error: `Role "${identity.role}" not authorized to ${operation} events.` };
  }
  return {};
}

function validateEventFields(input: {
  title: string;
  category: string;
  description: string;
  startDate: number;
  qdnUrl?: string;
}): { error?: string } {
  if (!input.title.trim()) return { error: 'Title is required.' };
  if (!input.category.trim()) return { error: 'Category is required.' };
  if (!input.description.trim()) return { error: 'Description is required.' };
  if (!Number.isFinite(input.startDate)) return { error: 'Start date is required.' };
  const qdnUrl = input.qdnUrl?.trim();
  if (qdnUrl && !/^qdn:\/\//i.test(qdnUrl)) {
    return { error: 'QDN URL must start with qdn://.' };
  }
  return {};
}

// ---- API ----

export const eventApi = createApi({
  reducerPath: 'eventApi',
  baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['Events'],
  endpoints: (builder) => ({

    // ===== GET EVENTS (active + archived) =====
    getEvents: builder.query<EventListResult, string | void>({
      queryFn: (currentWallet) => queryFn(async () => {
        const result = await fetchValidatedEvents();
        const wallet = typeof currentWallet === 'string' ? currentWallet : '';

        if (result.status === 'unavailable') {
          return { status: 'unavailable' as const, events: [], diagnostics: [result.reason] };
        }

        const events = result.items
          .map((item) => toEventView(item as unknown as ValidatedEventEnvelope, wallet))
          .sort((a, b) =>
            a.startDateMs - b.startDateMs || a.title.localeCompare(b.title) || a.entityId.localeCompare(b.entityId),
          );

        const diagnostics = result.status === 'incomplete'
          ? result.diagnostics?.map((d) => d.message) ?? ['Incomplete results']
          : [];

        return {
          status: result.status === 'empty' ? 'empty' : result.status === 'incomplete' ? 'incomplete' : 'complete',
          events,
          diagnostics,
        } as EventListResult;
      }),
      providesTags: (result) =>
        result?.events
          ? [{ type: 'Events' as const, id: 'ALL' }, ...result.events.map((e) => ({ type: 'Events' as const, id: e.entityId }))]
          : [{ type: 'Events' as const, id: 'ALL' }],
    }),

    // ===== CREATE EVENT =====
    createEvent: builder.mutation<
      { event: EventView },
      { title: string; category: string; description: string; startDate: number; endDate?: number; location?: string; qdnUrl?: string }
    >({
      queryFn: async (input) => {
        try {
          const identity = resolvePublisherIdentity();
          const authErr = assertAuthorized(identity, 'create');
          if (authErr.error) return { error: authErr.error };
          const id = identity!;

          const fieldErr = validateEventFields(input);
          if (fieldErr.error) return { error: fieldErr.error };

          const entityId = generateEventEntityId();
          const now = Date.now();
          const payload = buildEventCreatePayload({
            entityId,
            category: input.category.trim(),
            title: input.title.trim(),
            description: input.description.trim(),
            startDate: input.startDate,
            endDate: input.endDate,
            location: input.location?.trim() || undefined,
            qdnUrl: input.qdnUrl?.trim() || undefined,
            ownerName: id.name,
            ownerAddress: id.address,
            createdAt: now,
          });

          const identifier = buildQucpIdentifier('qucp-event', entityId);
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: input.title,
            filename: `${entityId}.json`,
          });

          const event: EventView = {
            entityId,
            identifier,
            title: input.title.trim(),
            category: input.category.trim(),
            description: input.description.trim(),
            startDate: new Date(input.startDate).toISOString(),
            endDate: input.endDate ? new Date(input.endDate).toISOString() : null,
            startDateMs: input.startDate,
            endDateMs: input.endDate ?? null,
            location: input.location?.trim() || null,
            qdnUrl: input.qdnUrl?.trim() || null,
            ownerName: id.name,
            ownerAddress: id.address,
            createdAt: new Date(now).toISOString(),
            editedAt: null,
            status: 'active',
            revision: 1,
            isOwner: true,
          };
          return { data: { event } };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Publication failed.' };
        }
      },
      invalidatesTags: [{ type: 'Events', id: 'ALL' }],
    }),

    // ===== UPDATE EVENT =====
    updateEvent: builder.mutation<
      { event: EventView },
      { entityId: string; expectedRevision: number; title: string; category: string; description: string; startDate: number; endDate?: number; location?: string; qdnUrl?: string }
    >({
      queryFn: async (input) => {
        try {
          const identity = resolvePublisherIdentity();
          const authErr = assertAuthorized(identity, 'update');
          if (authErr.error) return { error: authErr.error };
          const id = identity!;

          const fieldErr = validateEventFields(input);
          if (fieldErr.error) return { error: fieldErr.error };

          const lookup = await fetchValidatedEventByEntityId(input.entityId);
          if (lookup.status === 'unavailable') return { error: 'Cannot verify event state — Events unavailable.' };
          if (lookup.status === 'not-found' || !lookup.event) return { error: `Event ${input.entityId} not found.` };

          const existing = lookup.event.envelope.data as QucpEvent;

          if (existing.status === 'archived') return { error: 'Archived events cannot be updated.' };
          if (existing.revision !== input.expectedRevision) {
            return { error: `Conflict: event was modified (expected revision ${input.expectedRevision}, current ${existing.revision}).` };
          }

          const payload = buildEventUpdatePayload({
            existing,
            category: input.category.trim(),
            title: input.title.trim(),
            description: input.description.trim(),
            startDate: input.startDate,
            endDate: input.endDate,
            location: input.location?.trim() || undefined,
            qdnUrl: input.qdnUrl?.trim() || undefined,
            ownerName: id.name,
            ownerAddress: id.address,
            expectedRevision: input.expectedRevision,
          });

          const identifier = buildQucpIdentifier('qucp-event', input.entityId);
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: input.title,
            filename: `${input.entityId}.json`,
          });

          const event: EventView = {
            entityId: input.entityId,
            identifier,
            title: input.title.trim(),
            category: input.category.trim(),
            description: input.description.trim(),
            startDate: new Date(input.startDate).toISOString(),
            endDate: input.endDate ? new Date(input.endDate).toISOString() : null,
            startDateMs: input.startDate,
            endDateMs: input.endDate ?? null,
            location: input.location?.trim() || null,
            qdnUrl: input.qdnUrl?.trim() || null,
            ownerName: id.name,
            ownerAddress: id.address,
            createdAt: existing.createdAt ? new Date(existing.createdAt).toISOString() : '',
            editedAt: null,
            status: existing.status,
            revision: existing.revision + 1,
            isOwner: true,
          };
          return { data: { event } };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Update failed.' };
        }
      },
      invalidatesTags: (_r, _e, { entityId }) => [{ type: 'Events', id: entityId }, { type: 'Events', id: 'ALL' }],
    }),

    // ===== ARCHIVE EVENT =====
    archiveEvent: builder.mutation<
      { event: EventView },
      { entityId: string; expectedRevision: number }
    >({
      queryFn: async (input) => {
        try {
          const identity = resolvePublisherIdentity();
          const authErr = assertAuthorized(identity, 'archive');
          if (authErr.error) return { error: authErr.error };
          const id = identity!;

          const lookup = await fetchValidatedEventByEntityId(input.entityId);
          if (lookup.status === 'unavailable') return { error: 'Cannot verify event state — Events unavailable.' };
          if (lookup.status === 'not-found' || !lookup.event) return { error: `Event ${input.entityId} not found.` };

          const existing = lookup.event.envelope.data as QucpEvent;

          if (existing.status === 'archived') return { error: 'Event is already archived.' };
          if (existing.revision !== input.expectedRevision) {
            return { error: `Conflict: event was modified (expected revision ${input.expectedRevision}, current ${existing.revision}).` };
          }

          const payload = buildEventUpdatePayload({
            existing,
            category: existing.category,
            title: existing.title,
            description: existing.description,
            startDate: existing.startDate,
            endDate: existing.endDate,
            location: existing.location,
            qdnUrl: existing.qdnUrl,
            ownerName: id.name,
            ownerAddress: id.address,
            expectedRevision: input.expectedRevision,
            newStatus: 'archived',
          });

          const identifier = buildQucpIdentifier('qucp-event', input.entityId);
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier,
            payload,
            title: existing.title,
            filename: `${input.entityId}.json`,
          });

          const event: EventView = {
            entityId: input.entityId,
            identifier,
            title: existing.title,
            category: existing.category,
            description: existing.description,
            startDate: existing.startDate ? new Date(existing.startDate).toISOString() : '',
            endDate: existing.endDate ? new Date(existing.endDate).toISOString() : null,
            startDateMs: existing.startDate,
            endDateMs: existing.endDate ?? null,
            location: existing.location ?? null,
            qdnUrl: existing.qdnUrl ?? null,
            ownerName: id.name,
            ownerAddress: id.address,
            createdAt: existing.createdAt ? new Date(existing.createdAt).toISOString() : '',
            editedAt: null,
            status: 'archived',
            revision: existing.revision + 1,
            isOwner: true,
          };
          return { data: { event } };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Archive failed.' };
        }
      },
      invalidatesTags: (_r, _e, { entityId }) => [{ type: 'Events', id: entityId }, { type: 'Events', id: 'ALL' }],
    }),
  }),
});

export const {
  useGetEventsQuery,
  useCreateEventMutation,
  useUpdateEventMutation,
  useArchiveEventMutation,
} = eventApi;
