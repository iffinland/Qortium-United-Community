// ===== Poll Runtime =====

import type { QucpPoll } from '../schemas/pollSchema';
import type { ValidatedRuntimeQueryResult } from './runtimeTypes';
import { validatedRuntimeQuery, type RuntimeQueryParams } from './validatedQueryRuntime';
import { pollPolicy } from '../policies/pollPolicy';
import { reducePollSnapshots, type ReducedPoll } from './pollSnapshotReducer';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QdnDiagnostic } from '../diagnostics';

// ---- Search Prefix ----

export const POLL_SEARCH_PREFIX = 'qucp-poll-' as const;

// ---- Query Result ----

export type PollQueryResult = ValidatedRuntimeQueryResult<QucpPoll>;

export interface ReducedPollListResult {
  polls: ReducedPoll[];
  completeness: 'complete' | 'incomplete' | 'unavailable' | 'empty';
  diagnostics: QdnDiagnostic[];
}

// ---- Payload Parser ----

function parsePollPayload(raw: unknown): QucpPoll | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-poll') return null;
  return d as QucpPoll;
}

// ---- Query Function ----

export async function queryPolls(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<PollQueryResult> {
  return validatedRuntimeQuery<QucpPoll>(searchFn, fetchFn, parsePollPayload, pollPolicy, identityResolver, {
    service: params?.service ?? 'DOCUMENT',
    identifierPrefix: params?.identifierPrefix ?? POLL_SEARCH_PREFIX,
    pageSize: params?.pageSize,
    safetyMax: params?.safetyMax,
    signal: params?.signal,
    adminAuthority: params?.adminAuthority,
    sharedAdminOwnership: params?.sharedAdminOwnership,
  });
}

// ---- Reduction ----

export function reducePollResults(
  queryResult: PollQueryResult,
): ReducedPollListResult {
  if (queryResult.status === 'unavailable' || queryResult.status === 'empty') {
    return { polls: [], completeness: queryResult.status, diagnostics: queryResult.diagnostics ?? [] };
  }

  // Group by entityId
  const byEntityId = new Map<string, QdnResourceEnvelope<QucpPoll>[]>();
  for (const item of queryResult.items) {
    const data = item.envelope.data as Record<string, unknown>;
    const eid = typeof data.entityId === 'string' ? data.entityId : '';
    if (!eid) continue;
    const existing = byEntityId.get(eid) ?? [];
    existing.push(item.envelope);
    byEntityId.set(eid, existing);
  }

  const polls: ReducedPoll[] = [];
  const allDiags: QdnDiagnostic[] = [...(queryResult.diagnostics ?? [])];

  for (const [entityId, envelopes] of byEntityId) {
    const reduction = reducePollSnapshots(entityId, envelopes);
    if (reduction.poll) polls.push(reduction.poll);
    allDiags.push(...reduction.diagnostics);
  }

  return {
    polls,
    completeness: queryResult.status,
    diagnostics: allDiags,
  };
}
