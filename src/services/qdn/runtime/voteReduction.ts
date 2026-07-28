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
 * Uses SHA-256 for collision resistance.
 */
export async function buildDeterministicVoteEntityId(
  pollEntityId: string,
  voterWallet: string,
): Promise<string> {
  const input = `qucp-vote:${pollEntityId}:${voterWallet}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Take first 16 hex chars (64 bits) for entity-safe ID
  return hashArray.slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Synchronous fallback for test environments where crypto.subtle is available.
 */
export function buildDeterministicVoteEntityIdSync(
  pollEntityId: string,
  voterWallet: string,
): string {
  // Simple deterministic hash for tests — production uses SHA-256 above
  let hash = 0;
  const str = `qucp-vote:${pollEntityId}:${voterWallet}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  // Convert to hex, ensure minimum 8 chars
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return hex.slice(0, 16);
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
