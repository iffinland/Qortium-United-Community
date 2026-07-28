// ===== Vote Runtime =====

import type { QucpVote } from '../schemas/voteSchema';
import type { ValidatedRuntimeQueryResult } from './runtimeTypes';
import { validatedRuntimeQuery, type RuntimeQueryParams } from './validatedQueryRuntime';
import { votePolicy } from '../policies/votePolicy';
import {
  authorizeVotesAgainstPolls,
  reduceContextualVotesToOnePerWallet,
  type ContextualActiveVote,
} from './contextualVoteAuth';
import type { ReducedPoll } from './pollSnapshotReducer';
import type { QdnSearchFn } from '../paginatedQdnSearch';
import type { QdnFetchFn } from '../fetchQdnResources';
import type { IdentityResolver } from '../IdentityResolver';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QdnDiagnostic } from '../diagnostics';

// ---- Search Prefix ----

export const VOTE_SEARCH_PREFIX = 'qucp-vote-' as const;

// ---- Query Result ----

export type VoteQueryResult = ValidatedRuntimeQueryResult<QucpVote>;

import type { ActiveVote } from './voteReduction';

export interface ReducedVoteResult {
  activeVotes: ActiveVote[];
  completeness: 'complete' | 'incomplete' | 'unavailable' | 'empty';
  diagnostics: QdnDiagnostic[];
}

// ---- Payload Parser ----

function parseVotePayload(raw: unknown): QucpVote | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-vote') return null;
  return d as QucpVote;
}

// ---- Query Function ----

export async function queryVotes(
  searchFn: QdnSearchFn,
  fetchFn: QdnFetchFn,
  identityResolver: IdentityResolver,
  params?: Partial<RuntimeQueryParams>,
): Promise<VoteQueryResult> {
  return validatedRuntimeQuery<QucpVote>(searchFn, fetchFn, parseVotePayload, votePolicy, identityResolver, {
    service: params?.service ?? 'DOCUMENT',
    identifierPrefix: params?.identifierPrefix ?? VOTE_SEARCH_PREFIX,
    pageSize: params?.pageSize,
    safetyMax: params?.safetyMax,
    signal: params?.signal,
  });
}

// ---- Contextual Reduction ----

export function reduceVoteResultsWithPollContext(
  queryResult: VoteQueryResult,
  canonicalPolls: Map<string, ReducedPoll>,
  pollDiscoveryComplete: boolean,
  pollDiscoveryAvailable: boolean,
): {
  activeVotes: ContextualActiveVote[];
  completeness: 'complete' | 'incomplete' | 'unavailable' | 'empty';
  diagnostics: QdnDiagnostic[];
} {
  if (queryResult.status === 'unavailable') {
    return { activeVotes: [], completeness: 'unavailable', diagnostics: queryResult.diagnostics ?? [] };
  }
  if (queryResult.status === 'empty') {
    return { activeVotes: [], completeness: 'empty', diagnostics: queryResult.diagnostics ?? [] };
  }

  const envelopes: QdnResourceEnvelope<QucpVote>[] = queryResult.items.map((item) => item.envelope);

  // Contextual authorization
  const authResult = authorizeVotesAgainstPolls(
    envelopes, canonicalPolls, pollDiscoveryComplete, pollDiscoveryAvailable,
  );

  if (!authResult.authorizationComplete && authResult.validVotes.length === 0) {
    return { activeVotes: [], completeness: 'unavailable', diagnostics: authResult.diagnostics };
  }

  // Vote-change reduction
  const reduction = reduceContextualVotesToOnePerWallet(authResult.validVotes, canonicalPolls);

  // Completeness combination
  let completeness: 'complete' | 'incomplete' | 'unavailable' | 'empty' = 'complete';
  if (!pollDiscoveryComplete || queryResult.status === 'incomplete') {
    completeness = 'incomplete';
  }
  if (!authResult.authorizationComplete && completeness === 'complete') {
    completeness = 'incomplete';
  }
  if (reduction.activeVotes.length === 0 && completeness === 'complete') {
    completeness = 'empty';
  }

  const allDiags = [
    ...(queryResult.diagnostics ?? []),
    ...authResult.diagnostics,
    ...reduction.diagnostics,
  ];

  return { activeVotes: reduction.activeVotes, completeness, diagnostics: allDiags };
}
