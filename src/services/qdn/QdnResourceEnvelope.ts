// ===== QDN Resource Envelope =====
//
// Each QDN resource carries authenticated metadata from Core
// (publisher name, timestamps) alongside the parsed payload.
// The metadata must never be discarded before validation.
//
// Embedded JSON identity fields (authorName, authorAddress, etc.)
// are NOT authoritative — they must be validated against the
// resolved publisher identity.

/** Authenticated QDN resource metadata from Core search/fetch results. */
export interface QdnResourceMetadata {
  /** QDN publisher name (authenticated by Core) */
  name: string;
  /** QDN service type (e.g. 'DOCUMENT') */
  service: string;
  /** QDN resource identifier */
  identifier: string;
  /** Creation timestamp from QDN metadata (milliseconds since epoch) */
  created?: number;
  /** Last update timestamp from QDN metadata (milliseconds since epoch) */
  updated?: number;
  /** Resource size in bytes (when available) */
  size?: number;
}

/**
 * Generic QDN resource envelope pairing authenticated Core metadata
 * with the parsed payload. Feature code must use this envelope,
 * not the raw parsed JSON alone, whenever publisher identity matters.
 */
export interface QdnResourceEnvelope<T> {
  /** Authenticated metadata from QDN Core */
  metadata: QdnResourceMetadata;

  /** Parsed resource payload */
  data: T;

  /** Resolved wallet address of the publisher (populated by identity resolver) */
  resolvedPublisherAddress?: string;

  /** Schema version extracted from the payload (if present) */
  schemaVersion?: number;

  /** Source: always 'qdn' for freshly fetched resources */
  source: 'qdn';
}

// ---- Construction helpers ----

/**
 * Create an envelope from search result metadata and parsed payload.
 * Malformed/falsy data is handled by callers — this is a simple constructor.
 */
export function createResourceEnvelope<T>(
  metadata: QdnResourceMetadata,
  data: T,
): QdnResourceEnvelope<T> {
  return {
    metadata,
    data,
    source: 'qdn',
  };
}

/**
 * Extract QDN metadata from a raw search result item.
 * Returns null if the result is missing required metadata fields.
 */
export function extractMetadata(raw: unknown): QdnResourceMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const service = typeof r.service === 'string' ? r.service.trim() : '';
  const identifier =
    typeof r.identifier === 'string' ? r.identifier.trim() : '';

  if (!name || !service || !identifier) return null;

  return {
    name,
    service,
    identifier,
    created: typeof r.created === 'number' ? r.created : undefined,
    updated: typeof r.updated === 'number' ? r.updated : undefined,
    size: typeof r.size === 'number' ? r.size : undefined,
  };
}

/**
 * Build a stable deduplication key from QDN metadata.
 * Uses service + name + identifier + timestamps to distinguish
 * the same resource published at different times by different names.
 */
export function metadataDedupeKey(meta: QdnResourceMetadata): string {
  return `${meta.service}|${meta.name}|${meta.identifier}|${meta.created ?? 0}|${meta.updated ?? 0}`;
}
