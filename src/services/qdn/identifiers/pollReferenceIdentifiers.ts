// ===== Poll Reference Identifiers =====
//
// qucp-pr-{entityId}
//
// The poll reference identifier is derived from the reference's own entity ID.
// Parent ID is NOT encoded in the identifier (consistent with child entity design).

// ---- Prefix ----

export const POLL_REFERENCE_PREFIX = 'qucp-pr-';

// ---- Builder ----

export function buildPollReferenceIdentifier(entityId: string): string {
  return `${POLL_REFERENCE_PREFIX}${entityId}`;
}

// ---- Parser ----

const POLL_REF_RE = /^qucp-pr-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function parsePollReferenceIdentifier(id: string): { entityId: string } | null {
  const m = id.match(POLL_REF_RE);
  return m ? { entityId: m[1] } : null;
}

// ---- Validator ----

export function validatePollReferenceIdentifier(identifier: string): boolean {
  return parsePollReferenceIdentifier(identifier) !== null;
}

// ---- Search Prefix ----

export function buildPollReferenceSearchPrefix(): string {
  return POLL_REFERENCE_PREFIX;
}
