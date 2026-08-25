// ===== QDN Runtime Event Adapter =====
//
// Bridges the QDN foundation to Event feature APIs.
// Uses qucp-event- discovery with publisher-aware validation.

import type { QucpEvent } from '../schemas/eventSchema';
import type { ValidatedRuntimeQueryResult, ValidatedResource, RuntimeDiagnostic } from './runtimeTypes';
import { validatedRuntimeQuery, type RuntimeQueryParams } from './validatedQueryRuntime';
import { eventPolicy } from '../policies/eventPolicy';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { AdminAuthorityProvider } from './runtimeTypes';

// ---- Discovery Prefix ----

export const EVENT_SEARCH_PREFIX = 'qucp-event-' as const;

// ---- Query Result ----

export type EventQueryResult = ValidatedRuntimeQueryResult<QucpEvent>;
export type ValidatedEvent = ValidatedResource<QucpEvent>;

// ---- Entity ID Generator ----

/**
 * Generate a full-strength collision-resistant entity ID.
 * Uses full crypto.randomUUID entropy with hyphens removed.
 */
export function generateEventEntityId(): string {
  return `ev-${crypto.randomUUID().replaceAll('-', '')}`;
}

// ---- Publication Builder (Create) ----

export interface CreateEventPayloadInput {
  entityId: string;
  category: string;
  title: string;
  description: string;
  startDate: number;
  endDate?: number;
  location?: string;
  qdnUrl?: string;
  ownerName: string;
  ownerAddress: string;
  createdAt: number;
}

export function buildEventCreatePayload(input: CreateEventPayloadInput): QucpEvent {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-event',
    entityId: input.entityId,
    category: input.category,
    title: input.title,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate,
    location: input.location,
    qdnUrl: input.qdnUrl,
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    createdAt: input.createdAt,
    revision: 1,
    status: 'active',
  };
}

// ---- Publication Builder (Update) ----

export interface UpdateEventPayloadInput {
  existing: QucpEvent;
  category: string;
  title: string;
  description: string;
  startDate: number;
  endDate?: number;
  location?: string;
  qdnUrl?: string;
  ownerName: string;
  ownerAddress: string;
  expectedRevision: number;
  newStatus?: 'active' | 'archived';
}

export function buildEventUpdatePayload(input: UpdateEventPayloadInput): QucpEvent {
  return {
    ...input.existing,
    category: input.category,
    title: input.title,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate,
    location: input.location,
    qdnUrl: input.qdnUrl,
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    revision: input.expectedRevision + 1,
    status: input.newStatus ?? input.existing.status,
  };
}

// ---- Payload Parser ----

function parseEventPayload(raw: unknown): QucpEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.entityId !== 'string') return null;
  if (typeof d.title !== 'string') return null;
  if (typeof d.description !== 'string') return null;
  if (d.resourceFamily !== 'qucp-event') return null;
  return d as QucpEvent;
}

// ---- Query Function ----

/**
 * Execute a fully validated event query using the shared runtime.
 */
export async function queryEvents(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<EventQueryResult> {
  return validatedRuntimeQuery<QucpEvent>(
    searchFn,
    fetchFn,
    parseEventPayload,
    eventPolicy,
    identityResolver,
    {
      service: params?.service ?? 'DOCUMENT',
      identifierPrefix: params?.identifierPrefix ?? EVENT_SEARCH_PREFIX,
      pageSize: params?.pageSize,
      safetyMax: params?.safetyMax,
      signal: params?.signal,
      adminAuthority: params?.adminAuthority,
      sharedAdminOwnership: params?.sharedAdminOwnership,
    },
  );
}

// ---- Exact Event Lookup ----

import { buildQucpIdentifier } from '../identifiers/qucpIdentifiers';
import { paginatedQdnSearch } from '../paginatedQdnSearch';
import { boundedFetchResources } from '../fetchQdnResources';
import { validateResource } from '../validationPipeline';
import { compareByQdnMetadata } from '../ordering/authoritativeEntityOrdering';

export type EventLookupStatus = 'available' | 'archived' | 'not-found' | 'malformed' | 'unavailable';

export interface EventLookupResult {
  status: EventLookupStatus;
  event: ValidatedEvent | null;
  diagnostics: RuntimeDiagnostic[];
}

/**
 * Fetch and validate a single Event by exact qucp-event-{entityId} identifier.
 * Uses identifier-specific bounded search — not full Event prefix discovery.
 */
export async function fetchValidatedEventByEntityId(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  entityId: string,
  adminAuthority?: AdminAuthorityProvider,
): Promise<EventLookupResult> {
  const identifier = buildQucpIdentifier('qucp-event', entityId);

  try {
    const searchResult = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT',
      identifier,
      prefix: false,
      reverse: true,
      includeMetadata: true,
    });

    if (!searchResult.complete || searchResult.reason === 'request-failed') {
      return {
        status: 'unavailable',
        event: null,
        diagnostics: [{ level: 'error', code: 'event-unavailable', message: 'Event search infrastructure unavailable' }],
      };
    }

    if (searchResult.items.length === 0) {
      return {
        status: 'not-found',
        event: null,
        diagnostics: [{ level: 'info', code: 'event-not-found', message: `Event ${entityId} not found` }],
      };
    }

    const fetchResult = await boundedFetchResources(fetchFn, parseEventPayload, searchResult.items);

    if (fetchResult.items.length === 0) {
      return { status: 'not-found', event: null, diagnostics: [{ level: 'info', code: 'event-not-found', message: `Event ${entityId} not found` }] };
    }

    const validated: Array<{ envelope: QdnResourceEnvelope<QucpEvent>; entityId: string; publisherName: string; publisherAddress: string }> = [];
    const diagnostics: RuntimeDiagnostic[] = [];

    for (const envelope of fetchResult.items) {
      const vr = await validateResource(envelope, eventPolicy, identityResolver);
      if (vr.status === 'accepted') {
        const d = vr.envelope.data as Record<string, unknown>;
        const eid = typeof d.entityId === 'string' ? d.entityId : '';
        if (eid !== entityId) {
          diagnostics.push({ level: 'warning', code: 'event-entity-mismatch', message: `Entity ID mismatch: expected ${entityId}, got ${eid}` });
          continue;
        }
        if (adminAuthority) {
          const wallet =
            vr.envelope.resolvedPublisherAddress ??
            (d.ownerAddress as string | undefined) ??
            '';
          const decision = adminAuthority({
            publisherWallet: wallet,
            mutationQdnTime: vr.envelope.metadata.updated ?? vr.envelope.metadata.created,
          });
          if (!decision.authorized) {
            diagnostics.push({
              level: 'warning',
              code: decision.reason ?? 'event-unauthorized',
              message: decision.detail ?? `Admin authority failed for event ${entityId}`,
              entityId,
              publisherName: vr.envelope.metadata.name,
            });
            continue;
          }
        }
        validated.push({
          envelope: vr.envelope,
          entityId: eid,
          publisherName: vr.envelope.metadata.name,
          publisherAddress: vr.envelope.resolvedPublisherAddress ?? (d.ownerAddress as string) ?? '',
        });
      }
    }

    if (validated.length === 0) {
      return { status: 'malformed', event: null, diagnostics: [...diagnostics, { level: 'warning', code: 'event-malformed', message: 'All candidates failed validation' }] };
    }

    // Canonical selection is the latest authorized mutation (Admin-managed
    // shared state), not the first publisher.
    const latest = validated.reduce((best, current) =>
      compareByQdnMetadata(current.envelope, best.envelope) < 0 ? current : best
    );

    const viewStatus = (latest.envelope.data as Record<string, unknown>).status;
    return {
      status: viewStatus === 'archived' ? 'archived' : 'available',
      event: latest,
      diagnostics,
    };
  } catch {
    return { status: 'unavailable', event: null, diagnostics: [{ level: 'error', code: 'event-unavailable', message: 'Event lookup failed' }] };
  }
}
