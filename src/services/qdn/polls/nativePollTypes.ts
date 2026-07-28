// ===== Native Poll Types =====
//
// Typed interfaces for Qortium Core native poll data.
// Based on verified Core/Hone source contracts.
// No embedded vote arrays, no QDN-derived results.

// ---- Poll Option ----

export interface NativePollOption {
  /** Core-assigned option name (label). Max 400 chars. */
  optionName: string;
  /** 0-based index in the poll's option list. */
  optionIndex: number;
}

// ---- Poll Status ----

export type NativePollStatus =
  | 'scheduled'
  | 'open'
  | 'closed'
  | 'expired'
  | 'unknown';

// ---- Poll Definition ----

export interface NativePollDefinition {
  /** Core-assigned stable numeric poll ID. */
  pollId: string;
  /** Core-assigned poll name (3–400 chars). */
  pollName: string;
  /** Optional description (max 4000 chars). */
  description?: string;
  /** Poll options in order. */
  options: NativePollOption[];
  /** Creator's public key (base58). */
  creatorPublicKey?: string;
  /** Creator's wallet address (base58). */
  owner?: string;
  /** Publication timestamp (epoch ms). */
  published: number;
  /** Scheduled start (epoch ms, optional). */
  startTime?: number;
  /** Scheduled end (epoch ms, optional). */
  endTime?: number;
}

// ---- Poll Results ----

export interface NativePollOptionResult {
  optionName: string;
  optionIndex: number;
  /** Raw vote count. */
  rawVotes: number;
  /** Trust-weighted vote count (if available). */
  weightedVotes?: number;
}

export interface NativePollResults {
  pollId: string;
  options: NativePollOptionResult[];
  totalRawVotes: number;
  totalWeightedVotes?: number;
  /** Whether results are complete (poll closed, fully tallied). */
  complete: boolean;
}

// ---- Vote State ----

export interface NativeVoteState {
  pollId: string;
  voterAddress: string;
  selectedOptionIndexes: number[];
  status: 'confirmed' | 'pending' | 'unknown';
}

// ---- Operation Results ----

export type PollResultStatus =
  | 'available'
  | 'not-found'
  | 'unconfirmed'
  | 'unavailable'
  | 'invalid-response'
  | 'unsupported';

export type PollResultsStatus =
  | 'complete'
  | 'partial'
  | 'unavailable'
  | 'invalid';

export type PollWriteStatus =
  | 'submitted'
  | 'confirmed'
  | 'user-rejected'
  | 'request-failed'
  | 'invalid-response'
  | 'unsupported';

// ---- Typed Result Wrappers ----

export interface NativePollDefinitionResult {
  status: PollResultStatus;
  poll?: NativePollDefinition;
  reason?: string;
}

export interface NativePollResultsResult {
  status: PollResultsStatus;
  results?: NativePollResults;
  reason?: string;
}

export interface NativeVoteStateResult {
  status: PollResultStatus;
  voteState?: NativeVoteState;
  reason?: string;
}

export interface CreateNativePollResult {
  status: PollWriteStatus;
  pollId?: string;
  pollName?: string;
  transactionSignature?: string;
  reason?: string;
}

export interface VoteOnNativePollResult {
  status: PollWriteStatus;
  transactionSignature?: string;
  reason?: string;
}

// ---- Poll Creation Input ----

export interface CreatePollInput {
  pollName: string;
  description?: string;
  options: string[];
  startTime?: number;
  endTime?: number;
}

// ---- Poll Vote Input ----

export interface VoteOnPollInput {
  pollId: string;
  optionIndexes: number[];
}

// ---- Poll Service Interface ----

export interface NativePollService {
  getPoll(pollId: string): Promise<NativePollDefinitionResult>;
  getResults(pollId: string): Promise<NativePollResultsResult>;
  getVoteState?(pollId: string, voterAddress: string): Promise<NativeVoteStateResult>;
  createPoll?(input: CreatePollInput): Promise<CreateNativePollResult>;
  vote?(input: VoteOnPollInput): Promise<VoteOnNativePollResult>;
}
