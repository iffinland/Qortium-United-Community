// ===== Media Reference Identifiers =====
//
// qucp-mr-{entityId}

export const MEDIA_REFERENCE_PREFIX = 'qucp-mr-';

export function buildMediaReferenceIdentifier(entityId: string): string {
  return `${MEDIA_REFERENCE_PREFIX}${entityId}`;
}

const MEDIA_REF_RE = /^qucp-mr-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function parseMediaReferenceIdentifier(id: string): { entityId: string } | null {
  const m = id.match(MEDIA_REF_RE);
  return m ? { entityId: m[1] } : null;
}

export function validateMediaReferenceIdentifier(identifier: string): boolean {
  return parseMediaReferenceIdentifier(identifier) !== null;
}

export function buildMediaReferenceSearchPrefix(): string {
  return MEDIA_REFERENCE_PREFIX;
}
