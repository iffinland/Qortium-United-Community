// ===== QDN Service =====
//
// Follows qortium-blog and Discussion-Boards proven patterns.
// Handles QDN publishing with proper resource readiness verification.

import { requestQortium } from './qortiumClient';
import { getOwnerName } from './qortiumClient';

// ---- Encoding (UTF-8 safe, matches blog/DB pattern) ----

export const encodeJsonToBase64 = (value: unknown): string => {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const parseJsonLike = <T = unknown>(raw: unknown): T => {
  if (typeof raw !== 'string') return raw as T;
  try { return JSON.parse(raw.trim()) as T; } catch { /* not JSON */ }
  try {
    const binary = atob(raw.trim());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return raw as unknown as T;
  }
};

// ---- Sleep helper ----

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- Fetch ----

export const fetchJsonResource = async <T>(
  service: string,
  name: string,
  identifier: string,
): Promise<T> => {
  const raw = await requestQortium<unknown>({
    action: 'FETCH_QDN_RESOURCE',
    service,
    name,
    identifier,
  });
  return parseJsonLike<T>(raw);
};

// ---- Search ----

export const searchResources = async (params: {
  service?: string;
  identifier?: string;
  name?: string;
  prefix?: boolean;
  limit?: number;
  offset?: number;
  reverse?: boolean;
  includeMetadata?: boolean;
}) => {
  const response = await requestQortium<unknown>({
    action: 'SEARCH_QDN_RESOURCES',
    mode: 'ALL',
    reverse: params.reverse ?? true,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    includeMetadata: params.includeMetadata ?? true,
    ...params,
  });
  return Array.isArray(response) ? response : [];
};

// ---- Resource status ----

const normalizeStatus = (value: unknown): { status: string } => {
  if (typeof value === 'string') return { status: value.toUpperCase() };
  if (value && typeof value === 'object') {
    const r = value as Record<string, unknown>;
    return { status: typeof r.status === 'string' ? r.status.toUpperCase() : 'UNKNOWN' };
  }
  return { status: 'UNKNOWN' };
};

// ---- Wait for resource ready (blog pattern) ----

export const waitForResourceReady = async (
  service: string,
  name: string,
  identifier: string,
  timeoutMs = 45_000,
) => {
  const startedAt = Date.now();
  let buildRequested = false;

  while (Date.now() - startedAt < timeoutMs) {
    const status = normalizeStatus(
      await requestQortium<unknown>({
        action: 'GET_QDN_RESOURCE_STATUS',
        service,
        name,
        identifier,
        ...(buildRequested ? {} : { build: true }),
      }),
    );
    buildRequested = true;
    if (status.status === 'READY' || status.status === 'NOT_PUBLISHED') return status;
    await sleep(1500);
  }

  return { status: 'TIMEOUT' } as { status: string };
};

// ---- Publish JSON resource (Discussion-Boards pattern: publish + verify) ----

const VERIFY_RETRIES = 8;
const VERIFY_DELAY_MS = 2000;

export const publishJsonResource = async (params: {
  service: string;
  identifier: string;
  payload: unknown;
  title?: string;
  description?: string;
  tags?: string[];
  filename?: string;
}) => {
  const name = await getOwnerName();
  const { service, identifier, payload, title, description, tags, filename } = params;

  console.log('[qdnService] Publishing:', { service, name, identifier, title });

  // Step 1: Publish
  const publishResult = await requestQortium<unknown>({
    action: 'PUBLISH_QDN_RESOURCE',
    service,
    name,
    identifier,
    data64: encodeJsonToBase64(payload),
    filename: filename || 'data.json',
    title,
    description,
    tags: tags?.slice(0, 5),
  });

  console.log('[qdnService] Publish response:', typeof publishResult, publishResult);

  // Check for obvious publish errors
  if (publishResult === false || publishResult === 'false') {
    throw new Error('QDN rejected the publish (returned false). Check that you own the name: ' + name);
  }
  if (typeof publishResult === 'string' && publishResult.toLowerCase().startsWith('error')) {
    throw new Error('QDN publish error: ' + publishResult);
  }
  if (publishResult && typeof publishResult === 'object') {
    const r = publishResult as Record<string, unknown>;
    if (r.error === true || r.success === false) {
      const msg = typeof r.message === 'string' ? r.message : 'QDN publish failed.';
      throw new Error(msg);
    }
  }

  // Step 2: Verify by re-fetching (Discussion-Boards pattern)
  for (let attempt = 1; attempt <= VERIFY_RETRIES; attempt++) {
    try {
      const raw = await requestQortium<unknown>({
        action: 'FETCH_QDN_RESOURCE',
        service,
        name,
        identifier,
      });
      const parsed = parseJsonLike(raw);
      if (parsed) {
        console.log('[qdnService] Verified: resource exists on QDN (attempt ' + attempt + ')');
        return { name, identifier };
      }
    } catch (err) {
      console.log('[qdnService] Verify attempt ' + attempt + ' failed:', err);
    }
    if (attempt < VERIFY_RETRIES) {
      await sleep(VERIFY_DELAY_MS);
    }
  }

  throw new Error('Resource was published but could not be verified on QDN after ' + VERIFY_RETRIES + ' attempts.');
};

// ---- Delete resource (Discussion-Boards tombstone pattern) ----

/** "Delete" by re-publishing the resource with a deleted marker.
 *  QDN resources are permanent, so we overwrite with a tombstone. */
export const deleteResource = async (params: {
  service: string;
  identifier: string;
  originalPayload: Record<string, unknown>;
  title?: string;
}): Promise<void> => {
  // Re-publish with deleted flag (Discussion-Boards tombstone pattern)
  const tombstone = { ...params.originalPayload, status: 'deleted', deletedAt: new Date().toISOString() };
  await publishJsonResource({
    service: params.service,
    identifier: params.identifier,
    payload: tombstone,
    title: params.title ? `[Deleted] ${params.title}` : 'Deleted resource',
    filename: `${params.identifier}.json`,
  });
};
