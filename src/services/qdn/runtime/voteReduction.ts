// ===== Vote Reduction =====
//
// One-active-vote-per-wallet reduction.
//
// For each poll+wallet, selects the latest valid vote snapshot
// by trusted QDN metadata (descending).

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpVote } from '../schemas/voteSchema';
import { compareByQdnMetadata } from '../ordering/authoritativeEntityOrdering';
import { warningDiag, type QdnDiagnostic } from '../diagnostics';
import { sha256Hex } from '../identifiers/sha256';

// ---- Result ----

export interface ActiveVote {
  vote: QdnResourceEnvelope<QucpVote>;
  voterWallet: string;
  optionId: string;
}

export interface VoteReductionResult {
  activeVotes: ActiveVote[];
  diagnostics: QdnDiagnostic[];
  rejectedCount: number;
}

// ---- Deterministic Vote Entity ID ----

/**
 * Build a deterministic vote entity ID from poll entity ID and voter wallet.
 *
 * This is the canonical, synchronous implementation. The writer and the
 * contextual vote authorizer MUST use this exact function, otherwise valid
 * votes are published under one entity ID and rejected under another.
 */
export function buildDeterministicVoteEntityIdSync(
  pollEntityId: string,
  voterWallet: string,
): string {
  const input = `qucp-vote:${pollEntityId}:${voterWallet}`;
  // First 16 hex characters (64 bits) of the full SHA-256 digest.
  return sha256Hex(input).slice(0, 16);
}

/**
 * Async-compatible alias kept for the publication layer.
 */
export async function buildDeterministicVoteEntityId(
  pollEntityId: string,
  voterWallet: string,
): Promise<string> {
  return buildDeterministicVoteEntityIdSync(pollEntityId, voterWallet);
}

// ---- Reduction ----

export function reduceVotesToOnePerWallet(
  acceptedVotes: QdnResourceEnvelope<QucpVote>[],
): VoteReductionResult {
  const diagnostics: QdnDiagnostic[] = [];
  let rejectedCount = 0;

  // Group votes by voter wallet
  const byWallet = new Map<string, QdnResourceEnvelope<QucpVote>[]>();
  for (const vote of acceptedVotes) {
    const wallet = vote.resolvedPublisherAddress ?? vote.data.ownerAddress;
    if (!wallet) {
      rejectedCount++;
      diagnostics.push(warningDiag('vote-missing-wallet',
        `Vote ${vote.data.entityId} has no resolved wallet`,
        { identifier: vote.metadata.identifier }));
      continue;
    }
    const existing = byWallet.get(wallet) ?? [];
    existing.push(vote);
    byWallet.set(wallet, existing);
  }

  const activeVotes: ActiveVote[] = [];

  for (const [wallet, votes] of byWallet) {
    if (votes.length === 0) continue;

    // Select latest by QDN metadata
    const sorted = [...votes].sort((a, b) => compareByQdnMetadata(a, b));
    const latest = sorted[0]; // newest first

    activeVotes.push({
      vote: latest,
      voterWallet: wallet,
      optionId: latest.data.optionIds[0],
    });
  }

  return { activeVotes, diagnostics, rejectedCount };
}
