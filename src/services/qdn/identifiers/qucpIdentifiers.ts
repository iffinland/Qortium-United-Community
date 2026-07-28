// ===== qucp Identifier System =====
//
// Deterministic identifier builders, parsers, and validators
// for the qucp- namespace.

import type { QucpResourceFamily } from '../schemas/commonSchemas';

// ---- Namespace ----

export const QUCP_NAMESPACE = 'qucp' as const;

// ---- Family Mapping ----

const FAMILY_IDENTIFIER_PREFIXES: Record<QucpResourceFamily, string> = {
  'qucp-post': 'post',
  'qucp-wiki': 'wiki',
  'qucp-forum-topic': 'forum-topic',
  'qucp-support-ticket': 'support-ticket',
  'qucp-post-comment': 'post-comment',
  'qucp-forum-reply': 'forum-reply',
  'qucp-ticket-reply': 'ticket-reply',
  'qucp-support-category': 'support-category',
  'qucp-poll': 'poll',
  'qucp-vote': 'vote',
  'qucp-project': 'project',
  'qucp-reaction': 'reaction',
  'qucp-owner-tombstone': 'owner-tombstone',
};

// ---- Identifier Constraints ----

const MAX_IDENTIFIER_LENGTH = 200;
const ENTITY_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---- Builder ----

/**
 * Build a full QDN identifier from a resource family and entity ID.
 *
 * Format: qucp-{familyPrefix}-{entityId}
 * Example: qucp-post-a1b2c3d4
 */
export function buildQucpIdentifier(
  family: QucpResourceFamily,
  entityId: string,
): string {
  const prefix = FAMILY_IDENTIFIER_PREFIXES[family];
  if (!prefix) {
    throw new Error(`Unknown resource family: ${family}`);
  }
  if (!ENTITY_ID_PATTERN.test(entityId)) {
    throw new Error(`Invalid entity ID: ${entityId}`);
  }
  const identifier = `${QUCP_NAMESPACE}-${prefix}-${entityId}`;
  if (identifier.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(
      `Identifier too long: ${identifier.length} > ${MAX_IDENTIFIER_LENGTH}`,
    );
  }
  return identifier;
}

// ---- Parser ----

export interface ParsedQucpIdentifier {
  namespace: string;
  family: QucpResourceFamily;
  familyPrefix: string;
  entityId: string;
  full: string;
}

/**
 * Parse a full QDN identifier into its components.
 * Returns null if the identifier does not match the qucp format.
 */
export function parseQucpIdentifier(
  identifier: string,
): ParsedQucpIdentifier | null {
  if (!identifier.startsWith(`${QUCP_NAMESPACE}-`)) return null;

  const parts = identifier.split('-');
  // qucp-{family}-{entityId}
  // qucp-{family}-{entityId}
  // parts: ['qucp', family, ...entityIdParts]
  if (parts.length < 3) return null;

  if (parts[0] !== 'qucp') return null;

  // Try two-word family prefix first (e.g., 'post-comment', 'forum-reply')
  // to avoid 'post' matching when 'post-comment' is intended.
  if (parts.length >= 4) {
    const doublePrefix = `${parts[1]}-${parts[2]}`;
    const doubleFamilyEntry = Object.entries(FAMILY_IDENTIFIER_PREFIXES).find(
      ([, prefix]) => prefix === doublePrefix,
    );
    if (doubleFamilyEntry) {
      const family = doubleFamilyEntry[0] as QucpResourceFamily;
      const entityId = parts.slice(3).join('-');
      return {
        namespace: QUCP_NAMESPACE,
        family,
        familyPrefix: doublePrefix,
        entityId,
        full: identifier,
      };
    }
  }

  // Try single-word family prefix
  const singlePrefix = parts[1];
  const singleFamilyEntry = Object.entries(FAMILY_IDENTIFIER_PREFIXES).find(
    ([, prefix]) => prefix === singlePrefix,
  );
  if (singleFamilyEntry) {
    const family = singleFamilyEntry[0] as QucpResourceFamily;
    const entityId = parts.slice(2).join('-');
    if (!ENTITY_ID_PATTERN.test(entityId)) return null;
    return {
      namespace: QUCP_NAMESPACE,
      family,
      familyPrefix: singlePrefix,
      entityId,
      full: identifier,
    };
  }

  return null;
}

// ---- Validators ----

/**
 * Validate that an identifier matches the expected family and entity ID.
 */
export function validateQucpIdentifier(
  identifier: string,
  expectedFamily: QucpResourceFamily,
): { valid: true; entityId: string } | { valid: false; reason: string } {
  const parsed = parseQucpIdentifier(identifier);
  if (!parsed) {
    return { valid: false, reason: `Identifier "${identifier}" does not match qucp format` };
  }
  if (parsed.family !== expectedFamily) {
    return {
      valid: false,
      reason: `Identifier family is "${parsed.family}", expected "${expectedFamily}"`,
    };
  }
  if (parsed.entityId.length > 64) {
    return { valid: false, reason: 'Entity ID too long' };
  }
  return { valid: true, entityId: parsed.entityId };
}

/**
 * Extract just the entity ID from a valid qucp identifier.
 * Returns null if the identifier is invalid.
 */
export function extractEntityId(identifier: string): string | null {
  const parsed = parseQucpIdentifier(identifier);
  return parsed ? parsed.entityId : null;
}

/**
 * Check if an identifier uses the qucp namespace.
 */
export function isQucpIdentifier(identifier: string): boolean {
  return identifier.startsWith(`${QUCP_NAMESPACE}-`) && !identifier.startsWith(`${QUCP_NAMESPACE}-v1-`);
}

/**
 * Build the search prefix for a resource family.
 * Example: 'qucp-post-' for posts.
 */
export function buildSearchPrefix(family: QucpResourceFamily): string {
  const prefix = FAMILY_IDENTIFIER_PREFIXES[family];
  return `${QUCP_NAMESPACE}-${prefix}-`;
}

// ---- Child Entity Identifiers ----
//
// Child identifiers contain ONLY the child entity ID. Parent references
// live in the payload (parentEntityId, parentReplyId) — not in the identifier.
//
// Format: qucp-{familyPrefix}-{entityId}
// Example: qucp-post-comment-comment456

/**
 * Build a QDN identifier for a child entity (comment/reply).
 *
 * Format: qucp-{familyPrefix}-{entityId}
 * Example: qucp-post-comment-comment456
 */
export function buildChildIdentifier(
  family: QucpResourceFamily,
  entityId: string,
): string {
  const prefix = FAMILY_IDENTIFIER_PREFIXES[family];
  if (!prefix) throw new Error(`Unknown resource family: ${family}`);
  if (!ENTITY_ID_PATTERN.test(entityId)) throw new Error(`Invalid entity ID: ${entityId}`);
  const identifier = `${QUCP_NAMESPACE}-${prefix}-${entityId}`;
  if (identifier.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(`Identifier too long: ${identifier.length} > ${MAX_IDENTIFIER_LENGTH}`);
  }
  return identifier;
}

/**
 * Validate a child entity identifier and extract the entity ID.
 * Does NOT extract a parent ID — parent references come from the payload.
 */
export function validateChildIdentifier(
  identifier: string,
  expectedFamily: QucpResourceFamily,
): { valid: true; entityId: string }
  | { valid: false; reason: string } {
  const parsed = parseQucpIdentifier(identifier);
  if (!parsed) {
    return { valid: false, reason: `Identifier "${identifier}" does not match qucp format` };
  }
  if (parsed.family !== expectedFamily) {
    return { valid: false, reason: `Identifier family is "${parsed.family}", expected "${expectedFamily}"` };
  }
  return { valid: true, entityId: parsed.entityId };
}
