// ===== Poll Input Validation =====
//
// Validates application-level poll creation/voting inputs
// against Core's actual contract limits.

import type { CreatePollInput, VoteOnPollInput } from './nativePollTypes';

// ---- Core Limits (verified from Poll.java) ----

export const POLL_LIMITS = {
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 400,
  MAX_DESCRIPTION_LENGTH: 4000,
  MIN_OPTIONS: 2,
  MAX_OPTIONS: 1000,
  MAX_OPTION_LENGTH: 400,
} as const;

// ---- Validation Results ----

export interface PollInputValidationResult {
  valid: boolean;
  errors: string[];
}

// ---- Create Poll Input Validation ----

export function validateCreatePollInput(input: CreatePollInput): PollInputValidationResult {
  const errors: string[] = [];

  if (!input.pollName || input.pollName.length < POLL_LIMITS.MIN_NAME_LENGTH) {
    errors.push(`Poll name must be at least ${POLL_LIMITS.MIN_NAME_LENGTH} characters`);
  }
  if (input.pollName && input.pollName.length > POLL_LIMITS.MAX_NAME_LENGTH) {
    errors.push(`Poll name must not exceed ${POLL_LIMITS.MAX_NAME_LENGTH} characters`);
  }

  if (input.description && input.description.length > POLL_LIMITS.MAX_DESCRIPTION_LENGTH) {
    errors.push(`Description must not exceed ${POLL_LIMITS.MAX_DESCRIPTION_LENGTH} characters`);
  }

  if (!input.options || input.options.length < POLL_LIMITS.MIN_OPTIONS) {
    errors.push(`Poll must have at least ${POLL_LIMITS.MIN_OPTIONS} options`);
  }

  if (input.options && input.options.length > POLL_LIMITS.MAX_OPTIONS) {
    errors.push(`Poll must not exceed ${POLL_LIMITS.MAX_OPTIONS} options`);
  }

  if (input.options) {
    const seen = new Set<string>();
    for (let i = 0; i < input.options.length; i++) {
      const opt = input.options[i].trim();
      if (!opt) {
        errors.push(`Option ${i + 1} is empty`);
      } else if (opt.length > POLL_LIMITS.MAX_OPTION_LENGTH) {
        errors.push(`Option ${i + 1} exceeds ${POLL_LIMITS.MAX_OPTION_LENGTH} characters`);
      } else if (seen.has(opt.toLowerCase())) {
        errors.push(`Duplicate option: "${opt}"`);
      } else {
        seen.add(opt.toLowerCase());
      }
    }
  }

  if (input.endTime !== undefined && input.startTime !== undefined && input.endTime <= input.startTime) {
    errors.push('End time must be after start time');
  }

  return { valid: errors.length === 0, errors };
}

// ---- Vote Input Validation ----

export function validateVoteInput(input: VoteOnPollInput): PollInputValidationResult {
  const errors: string[] = [];

  if (!input.pollId) {
    errors.push('Poll ID is required');
  }

  if (!input.optionIndexes || input.optionIndexes.length === 0) {
    errors.push('At least one option must be selected');
  }

  if (input.optionIndexes) {
    const seen = new Set<number>();
    for (const idx of input.optionIndexes) {
      if (!Number.isInteger(idx) || idx < 1) {
        errors.push(`Invalid option index: ${idx}. Options start at 1.`);
      } else if (seen.has(idx)) {
        errors.push(`Duplicate option index: ${idx}`);
      } else {
        seen.add(idx);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
