// ===== Polls RTK Query API =====
//
// Canonical poll & vote queries and mutations.
// Polls: qucp-poll-*, Votes: qucp-vote-*

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { publishJsonResource } from '../../services/qortium/qdnService';
import { buildQucpIdentifier } from '../../services/qdn/identifiers/qucpIdentifiers';
import {
  fetchValidatedPolls,
  fetchValidatedVotes,
  reducePollResults,
  reduceVoteResultsWithPollContext,
  derivePollResults,
  buildDeterministicVoteEntityId,
  type ReducedPollListResult,
  type DerivedPollResults,
} from '../../services/qdn/runtime/qdnRuntimeService';
import type { QdnDiagnostic } from '../../services/qdn/diagnostics';
import type { QucpPoll } from '../../services/qdn/schemas/pollSchema';

// ---- View Model Types ----

export interface PollView {
  id: string;
  question: string;
  description?: string;
  options: PollOptionView[];
  totalVotes: number;
  expiresAt: string | null;
  isClosed: boolean;
  allowVoteChange: boolean;
  ownerName: string;
  ownerAddress: string;
  createdAt: string;
  isOwner: boolean;
  resultsComplete: boolean;
}

export interface PollOptionView {
  optionId: string;
  label: string;
  voteCount: number;
  percentage: number | null;
}

export interface PollListResult {
  polls: PollView[];
  completeness: 'complete' | 'incomplete' | 'unavailable' | 'empty';
  diagnostics: readonly QdnDiagnostic[];
}

export interface PollDetailResult {
  poll: PollView | null;
  completeness: 'complete' | 'incomplete' | 'unavailable' | 'empty';
  currentUserVote: { optionId: string } | null;
  voteChangeAllowed: boolean;
  diagnostics: readonly QdnDiagnostic[];
}

// ---- Helpers ----

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
};

function toPollView(
  poll: ReducedPollListResult['polls'][0],
  results: DerivedPollResults,
  currentWallet: string,
): PollView {
  const snap = poll.snapshot;
  const hasTs = typeof snap.metadata.created === 'number';
  return {
    id: poll.entityId,
    question: snap.data.question,
    description: snap.data.description,
    options: results.options.map((o) => ({
      optionId: o.optionId,
      label: o.label,
      voteCount: o.voteCount,
      percentage: results.totalVotes > 0 ? Math.round((o.voteCount / results.totalVotes) * 100) : null,
    })),
    totalVotes: results.totalVotes,
    expiresAt: snap.data.expiresAt ? new Date(snap.data.expiresAt).toISOString() : null,
    isClosed: poll.isClosed,
    allowVoteChange: snap.data.allowVoteChange,
    ownerName: poll.canonicalOwnerName,
    ownerAddress: poll.canonicalOwnerWallet,
    createdAt: hasTs ? new Date(snap.metadata.created!).toISOString() : '',
    isOwner: poll.canonicalOwnerWallet === currentWallet,
    resultsComplete: results.resultsComplete,
  };
}

// ---- Poll Payload Builder ----

function buildPollPayload(input: {
  entityId: string;
  question: string;
  description?: string;
  options: Array<{ optionId: string; label: string }>;
  expiresAt?: number;
  allowVoteChange: boolean;
  ownerName: string;
  ownerAddress: string;
  now?: number;
}): QucpPoll {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-poll',
    entityId: input.entityId,
    question: input.question,
    description: input.description,
    options: input.options.map((o) => ({ optionId: o.optionId, label: o.label })),
    expiresAt: input.expiresAt,
    isClosed: false,
    allowVoteChange: input.allowVoteChange,
    ownerName: input.ownerName,
    ownerAddress: input.ownerAddress,
    createdAt: input.now ?? Date.now(),
  };
}

// ---- API ----

export const pollApi = createApi({
  reducerPath: 'pollApi',
  baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['Polls', 'Votes'],
  endpoints: (builder) => ({

    // ===== POLL LIST =====
    getPolls: builder.query<PollListResult, string | void>({
      queryFn: (wallet) => queryFn(async () => {
        const pollResult = await fetchValidatedPolls();
        if (pollResult.status === 'unavailable') throw new Error('Polls unavailable.');

        const reduced = reducePollResults(pollResult);

        // Build canonical polls map for contextual vote authorization
        const canonicalPolls = new Map<string, typeof reduced.polls[0]>();
        for (const p of reduced.polls) {
          canonicalPolls.set(p.entityId, p);
        }

        // Derive results from contextually authorized votes
        const voteResult = await fetchValidatedVotes();
        const pollAvailable = true; // pollResult.status already checked above
        const pollComplete = pollResult.status === 'complete';
        const contextualVotes = reduceVoteResultsWithPollContext(
          voteResult, canonicalPolls as unknown as Parameters<typeof reduceVoteResultsWithPollContext>[1], pollComplete, pollAvailable,
        );

        const currentWallet = typeof wallet === 'string' ? wallet : '';

        const polls: PollView[] = [];
        for (const p of reduced.polls) {
          const pollVotes = contextualVotes.activeVotes.filter(
            (v) => v.vote.data.pollEntityId === p.entityId,
          );
          const results = derivePollResults(p, pollVotes, contextualVotes.completeness === 'complete');
          polls.push(toPollView(p, results, currentWallet));
        }

        const completeness = pollResult.status === 'complete' && (contextualVotes.completeness === 'complete' || contextualVotes.completeness === 'empty')
          ? 'complete' : contextualVotes.completeness === 'unavailable' ? 'unavailable' : 'incomplete';

        return {
          polls, completeness,
          diagnostics: [...(reduced.diagnostics ?? []), ...(contextualVotes.diagnostics ?? [])],
        };
      }),
      providesTags: ['Polls', 'Votes'],
    }),

    // ===== POLL DETAIL =====
    getPoll: builder.query<PollDetailResult, { pollId: string; wallet: string }>({
      queryFn: ({ pollId, wallet }) => queryFn(async () => {
        const pollResult = await fetchValidatedPolls();
        if (pollResult.status === 'unavailable') throw new Error('Polls unavailable.');

        const reduced = reducePollResults(pollResult);
        const found = reduced.polls.find((p) => p.entityId === pollId);

        if (!found) {
          if (pollResult.status === 'incomplete') {
            throw new Error('Poll not found in incomplete results.');
          }
          throw new Error('Poll not found.');
        }

        const canonicalPolls = new Map<string, typeof reduced.polls[0]>();
        for (const p of reduced.polls) canonicalPolls.set(p.entityId, p);

        const voteResult = await fetchValidatedVotes();
        const pollAvailable = true; // pollResult.status already checked above
        const pollComplete = pollResult.status === 'complete';
        const contextualVotes = reduceVoteResultsWithPollContext(
          voteResult, canonicalPolls as unknown as Parameters<typeof reduceVoteResultsWithPollContext>[1], pollComplete, pollAvailable,
        );

        const pollVotes = contextualVotes.activeVotes.filter(
          (v) => v.vote.data.pollEntityId === pollId,
        );
        const results = derivePollResults(found, pollVotes, contextualVotes.completeness === 'complete');

        const userVote = wallet
          ? pollVotes.find((v) => v.voterWallet === wallet) ?? null
          : null;

        const cCompleteness = pollResult.status === 'complete' && (contextualVotes.completeness === 'complete' || contextualVotes.completeness === 'empty')
          ? 'complete' : contextualVotes.completeness === 'unavailable' ? 'unavailable' : 'incomplete';

        return {
          poll: toPollView(found, results, wallet),
          completeness: cCompleteness,
          currentUserVote: userVote ? { optionId: userVote.optionId } : null,
          voteChangeAllowed: found.snapshot.data.allowVoteChange,
          diagnostics: [...(reduced.diagnostics ?? []), ...(contextualVotes.diagnostics ?? [])],
        };
      }),
      providesTags: (_r, _e, { pollId }) => [{ type: 'Polls', id: pollId }, 'Votes'],
    }),

    // ===== CREATE POLL =====
    createPoll: builder.mutation<PollView, {
      question: string; description?: string;
      options: Array<{ optionId: string; label: string }>;
      expiresAt?: string; allowVoteChange: boolean;
      ownerName: string; ownerAddress: string;
    }>({
      queryFn: async (input) => {
        try {
          const entityId = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const expiresAtMs = input.expiresAt ? new Date(input.expiresAt).getTime() : undefined;
          const payload = buildPollPayload({
            entityId, question: input.question, description: input.description,
            options: input.options, expiresAt: expiresAtMs,
            allowVoteChange: input.allowVoteChange,
            ownerName: input.ownerName, ownerAddress: input.ownerAddress,
          });
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier: buildQucpIdentifier('qucp-poll', entityId),
            payload,
            title: input.question,
            filename: `${entityId}.json`,
          });
          return {
            data: {
              id: entityId, question: input.question, description: input.description,
              options: input.options.map((o) => ({ optionId: o.optionId, label: o.label, voteCount: 0, percentage: null })),
              totalVotes: 0, expiresAt: input.expiresAt ?? null,
              isClosed: false, allowVoteChange: input.allowVoteChange,
              ownerName: input.ownerName, ownerAddress: input.ownerAddress,
              createdAt: new Date().toISOString(), isOwner: true, resultsComplete: true,
            },
          };
        } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
      },
      invalidatesTags: ['Polls'],
    }),

    // ===== SUBMIT VOTE =====
    submitVote: builder.mutation<{ optionId: string }, {
      pollEntityId: string; optionId: string;
      ownerName: string; ownerAddress: string;
    }>({
      queryFn: async (input) => {
        try {
          const voteEntityId = await buildDeterministicVoteEntityId(input.pollEntityId, input.ownerAddress);
          const payload = {
            schemaVersion: 1, resourceFamily: 'qucp-vote' as const,
            entityId: voteEntityId, pollEntityId: input.pollEntityId,
            optionIds: [input.optionId],
            ownerName: input.ownerName, ownerAddress: input.ownerAddress,
            createdAt: Date.now(),
          };
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier: buildQucpIdentifier('qucp-vote', voteEntityId),
            payload,
            title: `Vote on ${input.pollEntityId}`,
            filename: `${voteEntityId}.json`,
          });
          return { data: { optionId: input.optionId } };
        } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
      },
      invalidatesTags: (_r, _e, { pollEntityId }) => [{ type: 'Votes' }, { type: 'Polls', id: pollEntityId }],
    }),

    // ===== CLOSE POLL =====
    closePoll: builder.mutation<void, {
      pollEntityId: string; question: string; description?: string;
      options: Array<{ optionId: string; label: string }>;
      expiresAt?: number; allowVoteChange: boolean;
      ownerName: string; ownerAddress: string;
    }>({
      queryFn: async (input) => {
        try {
          const payload = buildPollPayload({
            entityId: input.pollEntityId, question: input.question,
            description: input.description, options: input.options,
            expiresAt: input.expiresAt, allowVoteChange: input.allowVoteChange,
            ownerName: input.ownerName, ownerAddress: input.ownerAddress,
          });
          // Override isClosed for the close snapshot
          (payload as Record<string, unknown>).isClosed = true;
          await publishJsonResource({
            service: 'DOCUMENT',
            identifier: buildQucpIdentifier('qucp-poll', input.pollEntityId),
            payload,
            title: input.question,
            filename: `${input.pollEntityId}.json`,
          });
          return { data: undefined };
        } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
      },
      invalidatesTags: (_r, _e, { pollEntityId }) => [{ type: 'Polls', id: pollEntityId }],
    }),
  }),
});

export const {
  useGetPollsQuery, useGetPollQuery,
  useCreatePollMutation, useSubmitVoteMutation, useClosePollMutation,
} = pollApi;
