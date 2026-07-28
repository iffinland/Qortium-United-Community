// ===== Native Poll Normalizers =====
//
// Pure functions that normalize raw Core/Home poll responses
// into typed application types. No network calls, no any.

import type {
  NativePollDefinition, NativePollResults, NativePollOption,
  NativePollOptionResult, NativePollDefinitionResult, NativePollResultsResult,
  CreateNativePollResult, VoteOnNativePollResult,
} from './nativePollTypes';

// ---- Helpers ----

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function safeString(v: unknown, fallback?: string): string | undefined {
  return typeof v === 'string' ? v : fallback;
}

function safeNumber(v: unknown, fallback?: number): number | undefined {
  return typeof v === 'number' && !isNaN(v) ? v : fallback;
}

function safeInt(v: unknown, fallback?: number): number | undefined {
  const n = safeNumber(v);
  return n !== undefined && Number.isInteger(n) ? n : fallback;
}

function safeArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function safeBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

// ---- Poll Definition Normalizer ----

export function normalizeNativePollDefinition(raw: unknown): NativePollDefinitionResult {
  if (!isObject(raw)) {
    return { status: 'invalid-response', reason: 'Response is not an object' };
  }

  const pollId = safeInt(raw.pollId ?? raw.poll_id);
  if (pollId === undefined || pollId <= 0) {
    return { status: 'invalid-response', reason: 'Missing or invalid pollId' };
  }

  const pollName = safeString(raw.pollName ?? raw.poll_name);
  if (!pollName || pollName.length < 3) {
    return { status: 'invalid-response', reason: 'Missing or invalid pollName' };
  }

  const options: NativePollOption[] = [];
  const rawOptions = safeArray(raw.pollOptions ?? raw.poll_options);
  const seenNames = new Set<string>();

  for (let i = 0; i < rawOptions.length; i++) {
    const opt = rawOptions[i];
    let name: string | undefined;

    if (isObject(opt)) {
      name = safeString(opt.optionName ?? opt.option_name);
    } else if (typeof opt === 'string') {
      name = opt;
    }

    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);
    options.push({ optionName: name, optionIndex: i });
  }

  if (options.length < 2) {
    return { status: 'invalid-response', reason: 'Poll must have at least 2 options' };
  }

  const poll: NativePollDefinition = {
    pollId: String(pollId),
    pollName,
    description: safeString(raw.description),
    options,
    creatorPublicKey: safeString(raw.creatorPublicKey ?? raw.creator_public_key),
    owner: safeString(raw.owner),
    published: safeNumber(raw.published, 0)!,
    startTime: safeNumber(raw.startTime ?? raw.start_time),
    endTime: safeNumber(raw.endTime ?? raw.end_time),
  };

  return { status: 'available', poll };
}

// ---- Poll Results Normalizer ----

export function normalizeNativePollResults(raw: unknown): NativePollResultsResult {
  if (!isObject(raw)) {
    return { status: 'invalid', reason: 'Response is not an object' };
  }

  const pollId = safeInt(raw.pollId ?? raw.poll_id);
  if (pollId === undefined || pollId <= 0) {
    return { status: 'invalid', reason: 'Missing or invalid pollId' };
  }

  const rawOpts = safeArray(raw.options ?? raw.pollOptions ?? raw.poll_options);
  const options: NativePollOptionResult[] = [];
  let totalRaw = 0;

  for (let i = 0; i < rawOpts.length; i++) {
    const opt = rawOpts[i];
    if (!isObject(opt)) continue;

    const rawVotes = safeInt(opt.rawVotes ?? opt.votes ?? opt.count, 0)!;
    if (rawVotes < 0) {
      return { status: 'invalid', reason: `Negative vote count for option ${i}` };
    }
    totalRaw += rawVotes;

    const name = safeString(opt.optionName ?? opt.option_name ?? opt.label, `Option ${i + 1}`)!;
    const weighted = safeInt(opt.weightedVotes ?? opt.weighted_votes);

    options.push({
      optionName: name,
      optionIndex: safeInt(opt.optionIndex ?? opt.option_index, i)!,
      rawVotes,
      weightedVotes: weighted !== undefined && weighted >= 0 ? weighted : undefined,
    });
  }

  const complete = safeBool(raw.complete ?? raw.isComplete ?? raw.is_complete);

  const results: NativePollResults = {
    pollId: String(pollId),
    options,
    totalRawVotes: totalRaw,
    totalWeightedVotes: safeInt(raw.totalWeightedVotes ?? raw.total_weighted_votes),
    complete,
  };

  return {
    status: complete ? 'complete' : 'partial',
    results,
  };
}

// ---- Create Poll Response Normalizer ----

export function normalizeCreatePollResponse(raw: unknown): CreateNativePollResult {
  if (!isObject(raw)) {
    return { status: 'invalid-response', reason: 'Response is not an object' };
  }

  const accepted = safeBool(raw.accepted, true);
  if (!accepted) {
    return { status: 'user-rejected', reason: safeString(raw.reason) ?? 'User rejected' };
  }

  const pollName = safeString(raw.pollName ?? raw.poll_name);
  return {
    status: 'confirmed',
    pollId: safeString(raw.pollId ?? raw.poll_id),
    pollName,
    transactionSignature: safeString(raw.transactionSignature ?? raw.transaction_signature ?? raw.signature),
  };
}

// ---- Vote Response Normalizer ----

export function normalizeVoteResponse(raw: unknown): VoteOnNativePollResult {
  if (!isObject(raw)) {
    return { status: 'invalid-response', reason: 'Response is not an object' };
  }

  const accepted = safeBool(raw.accepted, true);
  if (!accepted) {
    return { status: 'user-rejected', reason: safeString(raw.reason) ?? 'User rejected' };
  }

  return {
    status: 'confirmed',
    transactionSignature: safeString(raw.transactionSignature ?? raw.transaction_signature ?? raw.signature),
  };
}
