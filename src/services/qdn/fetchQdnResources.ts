// ===== Bounded Resource Fetch =====
//
// Fetches QDN resources with controlled concurrency.
// Individual fetch failures are isolated — they never destroy
// successful results from other resources.

import {
  type QdnResourceMetadata,
  type QdnResourceEnvelope,
  createResourceEnvelope,
} from './QdnResourceEnvelope';
import { warningDiag, type QdnDiagnostic } from './diagnostics';

// ---- Types ----

/** Function signature for a raw FETCH_QDN_RESOURCE bridge call. */
export type QdnFetchFn = (params: {
  service: string;
  name: string;
  identifier: string;
}) => Promise<unknown>;

/** Successful fetch result with parsed data. */
export interface FetchedResource<T> {
  envelope: QdnResourceEnvelope<T>;
}

/** Failed fetch result. */
export interface FetchFailure {
  metadata: QdnResourceMetadata;
  error: string;
}

/** Payload parser: takes the raw bridge response, returns typed data or null. */
export type PayloadParser<T> = (raw: unknown) => T | null;

/** Result of a bounded fetch operation. */
export interface BoundedFetchResult<T> {
  /** Successfully fetched and parsed resources (in input order). */
  items: QdnResourceEnvelope<T>[];
  /** Resources that could not be fetched or parsed. */
  failures: FetchFailure[];
  /** Whether every input resource was successfully fetched. */
  complete: boolean;
  /** Diagnostics. */
  diagnostics: QdnDiagnostic[];
}

// ---- Defaults ----

const DEFAULT_CONCURRENCY = 5;

/**
 * Bound an individual QDN fetch without cancelling the underlying bridge
 * promise. QDN reads are idempotent and the bridge promise cannot be
 * cancelled in JavaScript, so a late result is intentionally ignored.
 */
function withResourceFetchTimeout<T>(
  promise: Promise<T>,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  if (signal?.aborted) return Promise.reject(new Error('Resource fetch cancelled.'));

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback();
    };

    const onAbort = () => {
      finish(() => reject(new Error('Resource fetch cancelled.')));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Resource fetch timed out after ${timeoutMs}ms.`)));
    }, timeoutMs);

    promise.then(
      (value) => {
        finish(() => resolve(value));
      },
      (error) => {
        finish(() => reject(error));
      },
    );
  });
}

// ---- Implementation ----

/**
 * Fetch multiple QDN resources with bounded concurrency.
 *
 * Processes resources in input order using a worker-pool pattern.
 * Results maintain input order. Individual failures do not affect
 * other resources. Uses AbortSignal for cancellation.
 */
export async function boundedFetchResources<T>(
  fetchFn: QdnFetchFn,
  parser: PayloadParser<T>,
  metadatas: QdnResourceMetadata[],
  options?: {
    concurrency?: number;
    signal?: AbortSignal;
    fetchTimeoutMs?: number;
  },
): Promise<BoundedFetchResult<T>> {
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
  const signal = options?.signal;

  const diagnostics: QdnDiagnostic[] = [];
  const items: QdnResourceEnvelope<T>[] = new Array(metadatas.length);
  const failures: FetchFailure[] = [];
  let nextIndex = 0;
  let cancelled = false;

  const isCancelled = () => cancelled || signal?.aborted === true;

  // Listen for cancellation
  const onAbort = () => {
    cancelled = true;
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const workers: Promise<void>[] = [];

    for (let w = 0; w < concurrency && w < metadatas.length; w++) {
      workers.push(worker());
    }

    async function worker(): Promise<void> {
      while (true) {
        if (isCancelled()) return;

        const index = nextIndex++;
        if (index >= metadatas.length) return;

        const meta = metadatas[index];

        try {
          const raw = await withResourceFetchTimeout(
            fetchFn({
              service: meta.service,
              name: meta.name,
              identifier: meta.identifier,
            }),
            options?.fetchTimeoutMs,
            signal,
          );

          if (isCancelled()) return;

          const parsed = parser(raw);
          if (parsed === null) {
            failures.push({
              metadata: meta,
              error: `Payload parsing returned null for ${meta.service}/${meta.name}/${meta.identifier}`,
            });
            diagnostics.push(
              warningDiag(
                'FETCH_PARSE_FAILED',
                `Failed to parse payload for ${meta.service}/${meta.name}/${meta.identifier}`,
                meta,
              ),
            );
            items[index] = undefined as unknown as QdnResourceEnvelope<T>;
            continue;
          }

          items[index] = createResourceEnvelope(meta, parsed);
        } catch (err) {
          const errMsg =
            err instanceof Error ? err.message : 'Unknown fetch error';
          failures.push({
            metadata: meta,
            error: errMsg,
          });
          diagnostics.push(
            warningDiag(
              'FETCH_FAILED',
              `Failed to fetch ${meta.service}/${meta.name}/${meta.identifier}: ${errMsg}`,
              meta,
            ),
          );
          items[index] = undefined as unknown as QdnResourceEnvelope<T>;
        }
      }
    }

    await Promise.all(workers);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }

  // Filter out undefined slots (from failures)
  const successful = items.filter(
    (item): item is QdnResourceEnvelope<T> => item !== undefined,
  );

  return {
    items: successful,
    failures,
    complete: failures.length === 0,
    diagnostics,
  };
}
