// ===== Poll Linkage Validator =====
//
// Combines accepted QDN poll reference, authorized parent,
// and native poll definition into a complete linkage check.

import type { QucpPollReference } from '../schemas/pollReferenceSchema';
import type { NativePollDefinition } from './nativePollTypes';
import type { PollParentAuthStatus } from './pollReferenceAuthorization';

// ---- Linkage Status ----

export type PollLinkageStatus =
  | 'linked'
  | 'parent-unavailable'
  | 'parent-unauthorized'
  | 'poll-not-found'
  | 'poll-unavailable'
  | 'poll-creator-unverified'
  | 'poll-creator-mismatch'
  | 'poll-id-mismatch'
  | 'poll-invalid';

export interface PollLinkageResult {
  status: PollLinkageStatus;
  reason?: string;
  /** The linked poll definition if fully linked. */
  poll?: NativePollDefinition;
}

/**
 * Validate the full linkage chain:
 *   1. QDN reference is structurally accepted
 *   2. Reference is authorized for parent
 *   3. Native poll exists and matches
 *
 * @param reference - Accepted poll reference
 * @param parentAuth - Result of parent authorization
 * @param pollResult - Native poll definition (if available)
 */
export function validatePollLinkage(
  reference: QucpPollReference,
  parentAuthStatus: PollParentAuthStatus,
  poll: NativePollDefinition | null,
  pollAvailable: boolean,
): PollLinkageResult {
  // Check parent authorization
  if (parentAuthStatus === 'parent-missing' || parentAuthStatus === 'parent-unavailable') {
    return { status: 'parent-unavailable', reason: 'Parent entity not available' };
  }
  if (parentAuthStatus !== 'authorized') {
    return { status: 'parent-unauthorized', reason: `Parent authorization: ${parentAuthStatus}` };
  }

  // Check native poll availability
  if (!pollAvailable) {
    return { status: 'poll-unavailable', reason: 'Native poll data temporarily unavailable' };
  }

  if (!poll) {
    return { status: 'poll-not-found', reason: `Native poll ${reference.pollId} not found` };
  }

  // Verify poll identity
  if (poll.pollId !== reference.pollId) {
    return { status: 'poll-id-mismatch', reason: 'Poll ID mismatch' };
  }

  // Verify poll name if reference includes it
  if (reference.pollName && poll.pollName !== reference.pollName) {
    return { status: 'poll-id-mismatch', reason: 'Poll name mismatch' };
  }

  // Creator binding: verify poll creator matches reference owner (if creator info available)
  if (poll.owner && poll.owner !== reference.ownerAddress) {
    return { status: 'poll-creator-mismatch', reason: 'Poll creator does not match reference owner' };
  }

  // If creator info is missing but poll exists, mark as unverified (not a hard failure)
  if (!poll.owner && !poll.creatorPublicKey) {
    return { status: 'poll-creator-unverified', reason: 'Poll creator metadata unavailable' };
  }

  return { status: 'linked', poll };
}
