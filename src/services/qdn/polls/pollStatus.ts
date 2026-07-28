// ===== Poll Status Derivation =====
//
// Pure derivation of poll display status from trusted native data.
// Uses injected `now` for deterministic testing.

import type { NativePollDefinition, NativePollStatus } from './nativePollTypes';

/**
 * Derive the poll status from native poll definition and current time.
 *
 * Uses Core-provided startTime and endTime.
 * Does NOT use payload timestamps or QDN-derived times.
 */
export function derivePollStatus(
  poll: NativePollDefinition,
  now: number = Date.now(),
): NativePollStatus {
  // Scheduled: start time is in the future
  if (poll.startTime !== undefined && poll.startTime > now) {
    return 'scheduled';
  }

  // Open: no end time, or end time is in the future
  if (poll.endTime === undefined || poll.endTime > now) {
    return 'open';
  }

  // Closed/expired: end time has passed
  if (poll.endTime <= now) {
    return 'expired';
  }

  return 'unknown';
}

/**
 * Check if a poll is currently accepting votes.
 */
export function isPollOpen(poll: NativePollDefinition, now: number = Date.now()): boolean {
  return derivePollStatus(poll, now) === 'open';
}
