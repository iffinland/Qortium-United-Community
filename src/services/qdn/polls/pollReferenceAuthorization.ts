// ===== Poll Reference Parent Authorization =====
//
// Verifies that a poll reference is authorized for its parent entity.
// Only the canonical owner of the parent entity may attach a poll reference.

import type { QucpPollReference } from '../schemas/pollReferenceSchema';

// ---- Parent Entity Info ----

export interface CanonicalParentInfo {
  entityId: string;
  resourceFamily: string;
  ownerName: string;
  ownerAddress: string;
  status: 'accepted' | 'rejected' | 'unavailable';
}

// ---- Authorization Result ----

export type PollParentAuthStatus =
  | 'authorized'
  | 'parent-missing'
  | 'parent-unavailable'
  | 'parent-rejected'
  | 'parent-family-mismatch'
  | 'parent-entity-mismatch'
  | 'owner-mismatch';

export interface PollParentAuthResult {
  status: PollParentAuthStatus;
  reason?: string;
}

/**
 * Authorize a poll reference against its canonical parent entity.
 */
export function authorizePollReferenceForParent(
  reference: QucpPollReference,
  parent: CanonicalParentInfo | null,
): PollParentAuthResult {
  if (!parent) {
    return { status: 'parent-missing', reason: 'Parent entity not found' };
  }

  if (parent.status === 'unavailable') {
    return { status: 'parent-unavailable', reason: 'Parent entity temporarily unavailable' };
  }

  if (parent.status === 'rejected') {
    return { status: 'parent-rejected', reason: 'Parent entity was rejected' };
  }

  if (parent.resourceFamily !== reference.parentFamily) {
    return {
      status: 'parent-family-mismatch',
      reason: `Parent family "${parent.resourceFamily}" does not match reference "${reference.parentFamily}"`,
    };
  }

  if (parent.entityId !== reference.parentEntityId) {
    return {
      status: 'parent-entity-mismatch',
      reason: `Parent entity ID "${parent.entityId}" does not match reference "${reference.parentEntityId}"`,
    };
  }

  if (parent.ownerAddress !== reference.ownerAddress) {
    return {
      status: 'owner-mismatch',
      reason: `Parent owner "${parent.ownerAddress}" does not match reference owner "${reference.ownerAddress}"`,
    };
  }

  if (parent.ownerName !== reference.ownerName) {
    return {
      status: 'owner-mismatch',
      reason: `Parent owner name "${parent.ownerName}" does not match reference owner name "${reference.ownerName}"`,
    };
  }

  return { status: 'authorized' };
}
