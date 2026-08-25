// ===== Poll Vote Write/Read Round-Trip =====

import { describe, it, expect } from 'vitest';
import {
  buildDeterministicVoteEntityIdSync,
  buildDeterministicVoteEntityId,
} from '../services/qdn/runtime/voteReduction';
import {
  queryPolls,
  reducePollResults,
  type ReducedPollListResult,
} from '../services/qdn/runtime/pollRuntime';
import {
  queryVotes,
  reduceVoteResultsWithPollContext,
} from '../services/qdn/runtime/voteRuntime';
import { derivePollResults } from '../services/qdn/runtime/pollResultDerivation';
import { voteSchema } from '../services/qdn/schemas/voteSchema';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';

const POLL_ID = 'pl-1787400988262-uix8ld';
const VOTER_A = QUC_SYSOP_ADDRESS;
const VOTER_B = 'QN1XYwwmTzXemusDb9p7T1nKJEACLHGgaL';

function makePollEnvelope() {
  return {
    metadata: { name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier: `qucp-poll-${POLL_ID}`, created: 1787400991177, updated: 1787400991177 },
    data: {
      schemaVersion: 1,
      resourceFamily: 'qucp-poll',
      entityId: POLL_ID,
      question: 'Question?',
      options: [
        { optionId: 'po-mt4ced7o-0', label: 'Option A' },
        { optionId: 'po-mt4ced7o-1', label: 'Option B' },
      ],
      isClosed: false,
      allowVoteChange: true,
      ownerName: 'iffi_vaba_mees',
      ownerAddress: VOTER_A,
      createdAt: 1787400991177,
    },
    source: 'qdn' as const,
  };
}

function makeVoteEnvelope(wallet: string, name: string, entityId: string, optionId: string, created: number) {
  return {
    metadata: { name, service: 'DOCUMENT', identifier: `qucp-vote-${entityId}`, created, updated: created },
    data: {
      schemaVersion: 1,
      resourceFamily: 'qucp-vote',
      entityId,
      pollEntityId: POLL_ID,
      optionIds: [optionId],
      ownerName: name,
      ownerAddress: wallet,
      createdAt: created,
    },
    source: 'qdn' as const,
    resolvedPublisherAddress: wallet,
  };
}

describe('poll vote production round-trip', () => {
  it('writer and reader share the canonical SHA-256 vote entity ID', async () => {
    const sync = buildDeterministicVoteEntityIdSync(POLL_ID, VOTER_A);
    const asyncValue = await buildDeterministicVoteEntityId(POLL_ID, VOTER_A);
    expect(sync).toBe(asyncValue);
    expect(sync).toBe('5ea63a433c05025f');
  });

  it('published vote payload passes the canonical vote schema', () => {
    const entityId = buildDeterministicVoteEntityIdSync(POLL_ID, VOTER_A);
    const payload = makeVoteEnvelope(VOTER_A, 'iffi_vaba_mees', entityId, 'po-mt4ced7o-0', 1787403293798).data;
    const parsed = voteSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('one valid vote aggregates to total = 1 and increments the selected option', async () => {
    const pollResult = await queryPolls(
      async () => [{ name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier: `qucp-poll-${POLL_ID}`, created: 1787400991177, updated: 1787400991177 }],
      async () => makePollEnvelope().data,
      new IdentityResolver(async () => VOTER_A),
    );
    const reduced = reducePollResults(pollResult) as ReducedPollListResult;
    const polls = new Map<string, ReducedPollListResult['polls'][0]>();
    for (const p of reduced.polls) polls.set(p.entityId, p);

    const voteEntityId = buildDeterministicVoteEntityIdSync(POLL_ID, VOTER_A);
    const voteResult = await queryVotes(
      async () => [{ name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier: `qucp-vote-${voteEntityId}`, created: 1787403293798, updated: 1787403293798 }],
      async () => makeVoteEnvelope(VOTER_A, 'iffi_vaba_mees', voteEntityId, 'po-mt4ced7o-0', 1787403293798).data,
      new IdentityResolver(async () => VOTER_A),
    );
    const contextual = reduceVoteResultsWithPollContext(voteResult, polls, true, true);
    const pollVotes = contextual.activeVotes.filter((v) => v.vote.data.pollEntityId === POLL_ID);
    const results = derivePollResults(reduced.polls[0], pollVotes, contextual.completeness === 'complete');

    expect(results.totalVotes).toBe(1);
    expect(results.options.find((o) => o.optionId === 'po-mt4ced7o-0')?.voteCount).toBe(1);
  });

  it('two different users aggregate to total = 2', async () => {
    const pollResult = await queryPolls(
      async () => [{ name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier: `qucp-poll-${POLL_ID}`, created: 1787400991177, updated: 1787400991177 }],
      async () => makePollEnvelope().data,
      new IdentityResolver(async () => VOTER_A),
    );
    const reduced = reducePollResults(pollResult) as ReducedPollListResult;
    const polls = new Map<string, ReducedPollListResult['polls'][0]>();
    for (const p of reduced.polls) polls.set(p.entityId, p);

    const voteA = buildDeterministicVoteEntityIdSync(POLL_ID, VOTER_A);
    const voteB = buildDeterministicVoteEntityIdSync(POLL_ID, VOTER_B);
    const voteResult = await queryVotes(
      async () => [
        { name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier: `qucp-vote-${voteA}`, created: 1787403293798, updated: 1787403293798 },
        { name: 'Discussion_Boards', service: 'DOCUMENT', identifier: `qucp-vote-${voteB}`, created: 1787403479110, updated: 1787403479110 },
      ],
      async (params) => {
        if (params.identifier === `qucp-vote-${voteA}`) return makeVoteEnvelope(VOTER_A, 'iffi_vaba_mees', voteA, 'po-mt4ced7o-0', 1787403293798).data;
        return makeVoteEnvelope(VOTER_B, 'Discussion_Boards', voteB, 'po-mt4ced7o-0', 1787403479110).data;
      },
      new IdentityResolver(async (name) => name === 'Discussion_Boards' ? VOTER_B : VOTER_A),
    );
    const contextual = reduceVoteResultsWithPollContext(voteResult, polls, true, true);
    const pollVotes = contextual.activeVotes.filter((v) => v.vote.data.pollEntityId === POLL_ID);
    const results = derivePollResults(reduced.polls[0], pollVotes, contextual.completeness === 'complete');

    expect(results.totalVotes).toBe(2);
    expect(results.options.find((o) => o.optionId === 'po-mt4ced7o-0')?.voteCount).toBe(2);
  });

  it('malformed vote is excluded truthfully', async () => {
    const pollResult = await queryPolls(
      async () => [{ name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier: `qucp-poll-${POLL_ID}`, created: 1787400991177, updated: 1787400991177 }],
      async () => makePollEnvelope().data,
      new IdentityResolver(async () => VOTER_A),
    );
    const reduced = reducePollResults(pollResult) as ReducedPollListResult;
    const polls = new Map<string, ReducedPollListResult['polls'][0]>();
    for (const p of reduced.polls) polls.set(p.entityId, p);

    const voteResult = await queryVotes(
      async () => [{ name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier: 'qucp-vote-bad', created: 1787403293798, updated: 1787403293798 }],
      async () => ({ schemaVersion: 1, resourceFamily: 'qucp-vote', entityId: 'bad', pollEntityId: POLL_ID, optionIds: ['nonexistent'], ownerName: 'iffi_vaba_mees', ownerAddress: VOTER_A, createdAt: 1787403293798 }),
      new IdentityResolver(async () => VOTER_A),
    );
    const contextual = reduceVoteResultsWithPollContext(voteResult, polls, true, true);
    expect(contextual.activeVotes).toHaveLength(0);
  });
});
