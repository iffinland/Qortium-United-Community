// ===== QDN Service =====
//
// Follows qortium-blog and Discussion-Boards proven patterns.
// Handles QDN publishing with proper resource readiness verification.

import { requestQortium } from './qortiumClient';
import { getOwnerName } from './qortiumClient';
import { isBridgeError } from '../qdn/qdnErrors';

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

/**
 * Canonical serialization used to compare the intended published payload with
 * the payload read back from QDN. Object keys are sorted so comparison is
 * independent of JSON key ordering. This is the H5 stale-readback boundary:
 * an older payload at the same coordinate must not satisfy confirmation.
 */
const canonicalizeJson = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // JSON.stringify omits undefined-valued object keys. The intended payload
    // is serialized to JSON before publication, so the canonical comparison
    // must apply the same rule or an optional field such as `reason` would
    // mismatch the round-tripped resource.
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
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

/**
 * Truthful publication confirmation result.
 *
 * `confirmed` means the intended payload was read back from the canonical
 * coordinate and matched. `accepted-unconfirmed` means QDN accepted the write
 * but the intended payload could not be read back within the bounded window;
 * this is explicitly NOT a successful update and MUST NOT be retried blindly.
 */
export type PublishConfirmationResult =
  | {
      status: 'confirmed';
      name: string;
      identifier: string;
    }
  | {
      status: 'accepted-unconfirmed';
      name: string;
      identifier: string;
      reason: string;
    };

export class PublicationNotConfirmedError extends Error {
  readonly status = 'accepted-unconfirmed' as const;
  readonly resourceName: string;
  readonly identifier: string;

  constructor(name: string, identifier: string, reason: string) {
    super(
      `QDN accepted the publish but the intended payload was not confirmed at ` +
        `${name}/${identifier}: ${reason}`,
    );
    this.name = 'PublicationNotConfirmedError';
    this.resourceName = name;
    this.identifier = identifier;
  }
}

/**
 * Require a confirmed publication result, throwing otherwise.
 * Existing mutation paths use this so an accepted-but-unconfirmed write is
 * surfaced as an error rather than as a false success.
 */
export const requireConfirmedPublication = (
  result: PublishConfirmationResult,
): { name: string; identifier: string } => {
  if (result.status === 'confirmed') {
    return { name: result.name, identifier: result.identifier };
  }
  throw new PublicationNotConfirmedError(
    result.name,
    result.identifier,
    result.reason,
  );
};

export const publishJsonResourceWithConfirmation = async (params: {
  service: string;
  identifier: string;
  payload: unknown;
  title?: string;
  description?: string;
  tags?: string[];
  filename?: string;
  verifyRetries?: number;
  verifyDelayMs?: number;
}): Promise<PublishConfirmationResult> => {
  const name = await getOwnerName();
  const { service, identifier, payload, title, description, tags, filename } = params;
  const verifyRetries = params.verifyRetries ?? VERIFY_RETRIES;
  const verifyDelayMs = params.verifyDelayMs ?? VERIFY_DELAY_MS;

  console.log('[qdnService] Publishing:', { service, name, identifier, title });

  // Step 1: Publish
  let publishResult: unknown;
  try {
    publishResult = await requestQortium<unknown>({
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
  } catch (err) {
    // A write timeout is ambiguous: the bridge may have accepted the
    // publication even though we never received a response. This must not be
    // reported as a definite failure and must not be blindly retried.
    if (isBridgeError(err) && err.code === 'TIMEOUT') {
      return {
        status: 'accepted-unconfirmed',
        name,
        identifier,
        reason: `Publication outcome is unknown after timeout: ${err.message}`,
      };
    }
    throw err;
  }

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

  // Step 2: Verify that the intended payload is actually the canonical value.
  // A prior payload at the same coordinate must not satisfy confirmation.
  const intendedCanonical = canonicalizeJson(payload);
  let lastReason = 'Resource was not readable after publication.';

  for (let attempt = 1; attempt <= verifyRetries; attempt++) {
    try {
      const raw = await requestQortium<unknown>({
        action: 'FETCH_QDN_RESOURCE',
        service,
        name,
        identifier,
      });
      const parsed = parseJsonLike<unknown>(raw);
      if (parsed !== null && parsed !== undefined && canonicalizeJson(parsed) === intendedCanonical) {
        console.log('[qdnService] Verified: intended payload read back on QDN (attempt ' + attempt + ')');
        return { status: 'confirmed', name, identifier };
      }
      lastReason = 'Published payload has not propagated yet (a stale or non-matching value was read back).';
    } catch (err) {
      console.log('[qdnService] Verify attempt ' + attempt + ' failed:', err);
      lastReason = err instanceof Error ? err.message : 'Resource fetch failed.';
    }
    if (attempt < verifyRetries) {
      await sleep(verifyDelayMs);
    }
  }

  return {
    status: 'accepted-unconfirmed',
    name,
    identifier,
    reason: lastReason,
  };
};

/**
 * Throwing convenience wrapper for mutation paths that do not need to
 * distinguish rejection from accepted-but-unconfirmed: confirmed returns the
 * coordinate, otherwise a PublicationNotConfirmedError is thrown so the caller
 * never reports a false success.
 */
export const publishJsonResource = async (
  params: Parameters<typeof publishJsonResourceWithConfirmation>[0],
): Promise<{ name: string; identifier: string }> =>
  requireConfirmedPublication(await publishJsonResourceWithConfirmation(params));

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
