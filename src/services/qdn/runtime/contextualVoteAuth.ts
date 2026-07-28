// ===== Contextual Vote Authorization =====
//
// Validates identity-accepted vote resources against canonical poll state.
// Runs after schema/identifier/publisher validation and before vote reduction.
//
// For each vote:
//   1. Resolve referenced canonical poll
//   2. Verify deterministic vote entity ID
//   3. Verify vote time >= poll publication time
//   4. Verify option exists in canonical poll options
//   5. Verify vote time < poll close time (if closed)
//   6. Verify vote time < poll expiry (if expiresAt set)

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpVote } from '../schemas/voteSchema';
import type { ReducedPoll } from './pollSnapshotReducer';
import { buildDeterministicVoteEntityIdSync } from './voteReduction';
import { warningDiag, type QdnDiagnostic } from '../diagnostics';

// ---- Result Types ----

export interface ContextualVoteValidation {
  /** Contextually valid votes, before reduction. */
  validVotes: QdnResourceEnvelope<QucpVote>[];
  /** Rejected votes with diagnostics. */
  rejectedVotes: Array<{ vote: QdnResourceEnvelope<QucpVote>; diagnostics: QdnDiagnostic[] }>;
  /** Whether contextual authorization is complete (poll state available). */
  authorizationComplete: boolean;
  /** All diagnostics. */
  diagnostics: QdnDiagnostic[];
}

// ---- Sort Helpers ----

function sortDiags(diags: QdnDiagnostic[]): QdnDiagnostic[] {
  return [...diags].sort((a, b) =>
    a.code.localeCompare(b.code) ||
    (a.identifier ?? '').localeCompare(b.identifier ?? '') ||
    a.message.localeCompare(b.message)
  );
}

// ---- Authorization ----

/**
 * Validate identity-accepted vote resources against canonical poll state.
 *
 * Returns structurally valid votes paired with poll context so that
 * vote-change semantics can be applied later in the reduction phase.
 */
export function authorizeVotesAgainstPolls(
  identityValidVotes: QdnResourceEnvelope<QucpVote>[],
  canonicalPolls: Map<string, ReducedPoll>,
  pollDiscoveryComplete: boolean,
  pollDiscoveryAvailable: boolean,
): ContextualVoteValidation {
  const validVotes: QdnResourceEnvelope<QucpVote>[] = [];
  const rejectedVotes: Array<{ vote: QdnResourceEnvelope<QucpVote>; diagnostics: QdnDiagnostic[] }> = [];
  const diagnostics: QdnDiagnostic[] = [];

  if (!pollDiscoveryAvailable) {
    return {
      validVotes: [],
      rejectedVotes: [],
      authorizationComplete: false,
      diagnostics: [warningDiag('vote-poll-runtime-unavailable',
        'Poll runtime unavailable — cannot authorize votes')],
    };
  }

  for (const vote of identityValidVotes) {
    const vDiags: QdnDiagnostic[] = [];
    const vid = vote.metadata.identifier;
    const pid = vote.data.pollEntityId;
    const resolvedWallet = vote.resolvedPublisherAddress ?? vote.data.ownerAddress;
    const voteTime = vote.metadata.created ?? 0;

    // 1. Resolve canonical poll
    const poll = canonicalPolls.get(pid);
    if (!poll) {
      if (pollDiscoveryComplete) {
        vDiags.push(warningDiag('vote-poll-not-accepted',
          `Vote ${vid} references poll ${pid} not in accepted set`, { identifier: vid }));
      } else {
        vDiags.push(warningDiag('vote-poll-discovery-incomplete',
          `Vote ${vid} references poll ${pid} — poll discovery incomplete`, { identifier: vid }));
      }
      rejectedVotes.push({ vote, diagnostics: vDiags });
      diagnostics.push(...vDiags);
      continue;
    }

    // 2. Verify deterministic vote entity ID
    const expectedId = buildDeterministicVoteEntityIdSync(pid, resolvedWallet);
    if (vote.data.entityId !== expectedId) {
      vDiags.push(warningDiag('vote-deterministic-id-mismatch',
        `Vote entityId ${vote.data.entityId} does not match expected ${expectedId}`, { identifier: vid }));
      rejectedVotes.push({ vote, diagnostics: vDiags });
      diagnostics.push(...vDiags);
      continue;
    }

    // 3. Vote time >= poll publication time
    const pollCreated = poll.snapshot.metadata.created ?? 0;
    if (voteTime < pollCreated) {
      vDiags.push(warningDiag('vote-before-poll',
        `Vote at ${voteTime} is before poll publication ${pollCreated}`, { identifier: vid }));
      rejectedVotes.push({ vote, diagnostics: vDiags });
      diagnostics.push(...vDiags);
      continue;
    }

    // 4. Verify option exists in canonical poll
    const optionIds = poll.snapshot.data.options.map(o => o.optionId);
    const voteOption = vote.data.optionIds[0];
    if (!optionIds.includes(voteOption)) {
      vDiags.push(warningDiag('vote-option-invalid',
        `Option ${voteOption} not in canonical poll ${pid}`, { identifier: vid }));
      rejectedVotes.push({ vote, diagnostics: vDiags });
      diagnostics.push(...vDiags);
      continue;
    }

    // 5. Vote time < close time (if closed)
    if (poll.isClosed) {
      const closeTime = poll.snapshot.metadata.created ?? 0;
      if (voteTime >= closeTime) {
        vDiags.push(warningDiag('vote-after-close',
          `Vote at ${voteTime} is at or after poll close ${closeTime}`, { identifier: vid }));
        rejectedVotes.push({ vote, diagnostics: vDiags });
        diagnostics.push(...vDiags);
        continue;
      }
    }

    // 6. Vote time < expiry
    const expiresAt = poll.snapshot.data.expiresAt;
    if (expiresAt !== undefined && voteTime >= expiresAt) {
      vDiags.push(warningDiag('vote-after-expiry',
        `Vote at ${voteTime} is at or after poll expiry ${expiresAt}`, { identifier: vid }));
      rejectedVotes.push({ vote, diagnostics: vDiags });
      diagnostics.push(...vDiags);
      continue;
    }

    // All checks passed — vote is contextually valid
    validVotes.push(vote);
  }

  return {
    validVotes,
    rejectedVotes,
    authorizationComplete: pollDiscoveryComplete,
    diagnostics: sortDiags(diagnostics),
  };
}

// ---- Vote-Change Reduction (contextual) ----

export interface ContextualActiveVote {
  vote: QdnResourceEnvelope<QucpVote>;
  voterWallet: string;
  optionId: string;
}

export interface ContextualReductionResult {
  activeVotes: ContextualActiveVote[];
  diagnostics: QdnDiagnostic[];
}

/**
 * Reduce contextually valid votes to one active vote per wallet,
 * respecting allowVoteChange semantics.
 *
 * allowVoteChange=false → earliest valid vote (by trusted QDN time)
 * allowVoteChange=true  → latest valid vote (by trusted QDN time)
 */
export function reduceContextualVotesToOnePerWallet(
  contextuallyValidVotes: QdnResourceEnvelope<QucpVote>[],
  canonicalPolls: Map<string, ReducedPoll>,
): ContextualReductionResult {
  const diagnostics: QdnDiagnostic[] = [];

  // Group by resolved wallet
  const byWallet = new Map<string, QdnResourceEnvelope<QucpVote>[]>();
  for (const vote of contextuallyValidVotes) {
    const wallet = vote.resolvedPublisherAddress ?? vote.data.ownerAddress;
    if (!wallet) continue;
    const existing = byWallet.get(wallet) ?? [];
    existing.push(vote);
    byWallet.set(wallet, existing);
  }

  const activeVotes: ContextualActiveVote[] = [];

  for (const [wallet, votes] of byWallet) {
    if (votes.length === 0) continue;

    const pid = votes[0].data.pollEntityId;
    const poll = canonicalPolls.get(pid);
    const allowChange = poll?.snapshot.data.allowVoteChange ?? true;

    // Sort by trusted QDN created timestamp
    const sorted = [...votes].sort((a, b) =>
      (a.metadata.created ?? 0) - (b.metadata.created ?? 0),
    );

    let selected: QdnResourceEnvelope<QucpVote>;

    if (!allowChange) {
      // Vote change disabled: select earliest
      selected = sorted[0];

      // Reject later votes
      for (let i = 1; i < sorted.length; i++) {
        diagnostics.push(warningDiag('vote-change-not-allowed',
          `Vote change not allowed for poll ${pid} — later vote ${sorted[i].data.entityId} rejected`,
          { identifier: sorted[i].metadata.identifier }));
      }
    } else {
      // Vote change enabled: select latest
      selected = sorted[sorted.length - 1];
    }

    activeVotes.push({
      vote: selected,
      voterWallet: wallet,
      optionId: selected.data.optionIds[0],
    });
  }

  return { activeVotes, diagnostics: sortDiags(diagnostics) };
}
