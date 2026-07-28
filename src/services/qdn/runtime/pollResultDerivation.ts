// ===== Poll Result Derivation =====
//
// Pure function: derives poll results from canonical poll + active votes.

import type { ReducedPoll } from './pollSnapshotReducer';
import type { ActiveVote } from './voteReduction';

export interface DerivedOptionResult {
  optionId: string;
  label: string;
  voteCount: number;
}

export interface DerivedPollResults {
  options: DerivedOptionResult[];
  totalVotes: number;
  /** Whether results should be treated as potentially incomplete. */
  resultsComplete: boolean;
}

/**
 * Derive poll results from the canonical poll snapshot and active votes.
 *
 * - Counts each active wallet once
 * - Counts only valid canonical option IDs
 * - Ignores votes with invalid/unknown option IDs
 * - Preserves poll option display order
 */
export function derivePollResults(
  poll: ReducedPoll,
  activeVotes: ActiveVote[],
  voteDiscoveryComplete: boolean,
): DerivedPollResults {
  const options = poll.snapshot.data.options;
  const optionMap = new Map(options.map((o) => [o.optionId, o.label]));

  // Count votes per option
  const voteCounts = new Map<string, number>();
  for (const opt of options) {
    voteCounts.set(opt.optionId, 0);
  }

  let totalVotes = 0;
  for (const vote of activeVotes) {
    if (optionMap.has(vote.optionId)) {
      const current = voteCounts.get(vote.optionId) ?? 0;
      voteCounts.set(vote.optionId, current + 1);
      totalVotes++;
    }
  }

  const derivedOptions: DerivedOptionResult[] = options.map((opt) => ({
    optionId: opt.optionId,
    label: opt.label,
    voteCount: voteCounts.get(opt.optionId) ?? 0,
  }));

  return {
    options: derivedOptions,
    totalVotes,
    resultsComplete: voteDiscoveryComplete,
  };
}
