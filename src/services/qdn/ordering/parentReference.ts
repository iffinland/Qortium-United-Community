// ===== Parent Reference & Orphan Classification =====
//
// Structural parent-reference validation for child entities.
// Schema validation can prove the reference is structurally valid
// but cannot prove the parent resource exists in QDN.

import type { ValidationDiagnostic } from '../validationTypes';
import { warningDiag } from '../diagnostics';

// ---- Orphan Classification ----

export type OrphanStatus =
  | 'linked'
  | 'parent-unavailable'
  | 'parent-rejected'
  | 'parent-missing'
  | 'parent-family-mismatch'
  | 'parent-reply-missing'
  | 'parent-reply-cross-topic'
  | 'reply-cycle'
  | 'depth-limit-exceeded';

export interface OrphanClassification {
  status: OrphanStatus;
  childIdentifier: string;
  parentIdentifier?: string;
  diagnostics: ValidationDiagnostic[];
}

/**
 * Classify a child entity based on whether its parent exists and is valid.
 *
 * This does NOT perform network lookups. It operates on already-loaded
 * accepted parent data provided by the caller.
 */
export function classifyOrphan(
  childIdentifier: string,
  parentEntityId: string,
  expectedParentFamily: string,
  acceptedParents: Array<{
    entityId: string;
    resourceFamily: string;
    status: 'accepted' | 'rejected' | 'unavailable';
  }>,
): OrphanClassification {
  const parent = acceptedParents.find((p) => p.entityId === parentEntityId);

  if (!parent) {
    return {
      status: 'parent-missing',
      childIdentifier,
      parentIdentifier: parentEntityId,
      diagnostics: [
        warningDiag('ORPHAN_PARENT_MISSING',
          `Parent ${parentEntityId} not found in loaded data for child ${childIdentifier}`,
          { identifier: childIdentifier }),
      ],
    };
  }

  if (parent.resourceFamily !== expectedParentFamily) {
    return {
      status: 'parent-family-mismatch',
      childIdentifier,
      parentIdentifier: parentEntityId,
      diagnostics: [
        warningDiag('ORPHAN_PARENT_FAMILY_MISMATCH',
          `Parent ${parentEntityId} is family "${parent.resourceFamily}", expected "${expectedParentFamily}"`,
          { identifier: childIdentifier }),
      ],
    };
  }

  if (parent.status === 'unavailable') {
    return {
      status: 'parent-unavailable',
      childIdentifier,
      parentIdentifier: parentEntityId,
      diagnostics: [
        warningDiag('ORPHAN_PARENT_UNAVAILABLE',
          `Parent ${parentEntityId} is temporarily unavailable for child ${childIdentifier}`,
          { identifier: childIdentifier }),
      ],
    };
  }

  if (parent.status === 'rejected') {
    return {
      status: 'parent-rejected',
      childIdentifier,
      parentIdentifier: parentEntityId,
      diagnostics: [
        warningDiag('ORPHAN_PARENT_REJECTED',
          `Parent ${parentEntityId} was rejected for child ${childIdentifier}`,
          { identifier: childIdentifier }),
      ],
    };
  }

  return {
    status: 'linked',
    childIdentifier,
    parentIdentifier: parentEntityId,
    diagnostics: [],
  };
}

// ---- Structural Parent Validation ----

/**
 * Validate that a child entity's parent reference is structurally sound.
 * Checks: parent ID is non-empty, valid entity ID format, not self-referencing.
 */
export function validateParentReference(
  parentEntityId: string,
  childEntityId: string,
): { valid: true } | { valid: false; reason: string } {
  if (!parentEntityId) {
    return { valid: false, reason: 'Parent entity ID is empty' };
  }

  if (parentEntityId === childEntityId) {
    return { valid: false, reason: 'Parent entity ID cannot be the same as child entity ID' };
  }

  return { valid: true };
}

// ---- Forum Thread Structure Helpers ----

/** Maximum nested reply depth. */
export const MAX_REPLY_DEPTH = 8;

export type ReplyChainStatus =
  | 'valid-chain'
  | 'missing-parent-reply'
  | 'self-cycle'
  | 'multi-reply-cycle'
  | 'cross-topic-parent'
  | 'depth-limit-exceeded';

export interface ReplyChainResult {
  status: ReplyChainStatus;
  entityId: string;
  diagnostics: string[];
}

interface AcceptedReply {
  entityId: string;
  parentEntityId: string;
  parentReplyId?: string | null;
}

/**
 * Validate the reply chain for a forum reply against already-loaded replies.
 *
 * Checks:
 * - parentReplyId refers to an existing reply in the loaded set
 * - No self-cycles (reply cannot be its own parent)
 * - No multi-reply cycles (A→B→A)
 * - No cross-topic parent (parentReply must belong to the same topic)
 * - Depth limit is not exceeded
 */
export function validateReplyChain(
  reply: AcceptedReply,
  allReplies: AcceptedReply[],
  options?: { maxDepth?: number },
): ReplyChainResult {
  const maxDepth = options?.maxDepth ?? MAX_REPLY_DEPTH;

  // Top-level reply: no parentReplyId
  if (!reply.parentReplyId) {
    return { status: 'valid-chain', entityId: reply.entityId, diagnostics: [] };
  }

  // Self-cycle check
  if (reply.parentReplyId === reply.entityId) {
    return {
      status: 'self-cycle',
      entityId: reply.entityId,
      diagnostics: [`Reply ${reply.entityId} has parentReplyId pointing to itself`],
    };
  }

  // Walk the chain upward
  const visited = new Set<string>();
  let currentId = reply.parentReplyId;
  let depth = 1;
  visited.add(reply.entityId);

  while (currentId && depth <= maxDepth) {
    if (visited.has(currentId)) {
      return {
        status: 'multi-reply-cycle',
        entityId: reply.entityId,
        diagnostics: [`Cycle detected: ${reply.entityId} → ... → ${currentId} → ...`],
      };
    }
    visited.add(currentId);

    const parentReply = allReplies.find((r) => r.entityId === currentId);
    if (!parentReply) {
      return {
        status: 'missing-parent-reply',
        entityId: reply.entityId,
        diagnostics: [`Parent reply ${currentId} not found in loaded replies for ${reply.entityId}`],
      };
    }

    // Cross-topic check: parent reply must belong to the same topic
    if (parentReply.parentEntityId !== reply.parentEntityId) {
      return {
        status: 'cross-topic-parent',
        entityId: reply.entityId,
        diagnostics: [
          `Parent reply ${currentId} belongs to topic ${parentReply.parentEntityId}, but reply ${reply.entityId} belongs to topic ${reply.parentEntityId}`,
        ],
      };
    }

    if (!parentReply.parentReplyId) break; // Reached top-level reply
    currentId = parentReply.parentReplyId;
    depth++;
  }

  if (depth > maxDepth) {
    return {
      status: 'depth-limit-exceeded',
      entityId: reply.entityId,
      diagnostics: [`Reply chain depth ${depth} exceeds limit ${maxDepth} for ${reply.entityId}`],
    };
  }

  return { status: 'valid-chain', entityId: reply.entityId, diagnostics: [] };
}
