// ===== Media Metadata Normalizer =====

import type { QdnMediaMetadata, MediaResourceStatus } from './mediaTypes';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function s(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function n(v: unknown): number | undefined {
  return typeof v === 'number' && !isNaN(v) && v >= 0 ? v : undefined;
}

const VALID_SERVICES = new Set(['IMAGE', 'THUMBNAIL', 'FILE', 'VIDEO', 'AUDIO']);
const VALID_STATUSES: MediaResourceStatus[] = ['available', 'unconfirmed', 'unavailable', 'deleted', 'blocked', 'unknown'];

function normalizeStatus(v: unknown): MediaResourceStatus {
  const str = typeof v === 'string' ? v.toLowerCase() : '';
  return VALID_STATUSES.includes(str as MediaResourceStatus) ? (str as MediaResourceStatus) : 'unknown';
}

export function normalizeQdnMediaMetadata(raw: unknown): QdnMediaMetadata | null {
  if (!isObject(raw)) return null;

  const service = s(raw.service ?? raw.qdnService);
  if (!service || !VALID_SERVICES.has(service)) return null;

  const identifier = s(raw.identifier ?? raw.qdnIdentifier);
  if (!identifier) return null;

  const publisherName = s(raw.name ?? raw.publisherName);
  if (!publisherName) return null;

  return {
    service,
    identifier,
    publisherName,
    publisherAddress: s(raw.publisherAddress ?? raw.owner),
    filename: s(raw.filename ?? raw.fileName),
    mimeType: s(raw.mimeType ?? raw.contentType),
    size: n(raw.size ?? raw.fileSize),
    status: normalizeStatus(raw.status),
  };
}
