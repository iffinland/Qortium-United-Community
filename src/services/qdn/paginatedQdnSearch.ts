// ===== Paginated QDN Search =====
//
// Generic paginated search primitive that iterates SEARCH_QDN_RESOURCES
// until exhaustion, safety budget, or explicit stop condition.
// Reports completeness explicitly — never silences truncation.

import {
  extractMetadata,
  metadataDedupeKey,
  type QdnResourceMetadata,
} from './QdnResourceEnvelope';
import {
  infoDiag,
  warningDiag,
  type QdnDiagnostic,
} from './diagnostics';
import { isBridgeError } from './qdnErrors';

// ---- Types ----

/** Parameters for the paginated QDN search. */
export interface PaginatedSearchParams {
  /** QDN service type (e.g. 'DOCUMENT') */
  service: string;
  /** Identifier or identifier prefix */
  identifier: string;
  /** Whether identifier is a prefix (default: true) */
  prefix?: boolean;
  /** Results per page (default: 50) */
  pageSize?: number;
  /** Reverse order (newest first; default: true) */
  reverse?: boolean;
  /** Include metadata in search results (default: true) */
  includeMetadata?: boolean;
  /** Maximum total raw results allowed before safety stop */
  safetyMax?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /**
   * Optional reader-side filter applied to each metadata record.
   *
   * Non-matching records are excluded from the result and, critically, are
   * excluded from the configured `safetyMax` result budget. This prevents an
   * overlapping child family (for example `qucp-post-comment-*` while
   * discovering `qucp-post-*`) from consuming the parent domain's budget and
   * starving older parent entities.
   */
  filter?: (metadata: QdnResourceMetadata) => boolean;
  /**
   * Absolute safety cap on raw pages/records read regardless of filtering.
   * Defaults to `Math.max(safetyMax, safetyMax * 10)`.
   */
  rawSafetyMax?: number;
}

/** Result shape for paginated search. */
export interface PaginatedQdnSearchResult {
  /** Collection of metadata records from search results */
  items: QdnResourceMetadata[];
  /** Whether all available results were retrieved */
  complete: boolean;
  /** Number of pages fetched */
  pagesRead: number;
  /** Total raw results returned by all pages */
  rawResultCount: number;
  /** Number of duplicate metadata records removed */
  deduplicatedCount: number;
  /** Number of raw records removed by the optional result filter. */
  filteredCount: number;
  /** Why the search stopped (only meaningful when complete === false) */
  reason?:
    | 'exhausted'
    | 'safety-budget-reached'
    | 'cancelled'
    | 'timeout'
    | 'repeated-page'
    | 'request-failed'
    | 'invalid-response';
  /** Diagnostics accumulated during the search */
  diagnostics: QdnDiagnostic[];
}

/** Function signature for the raw SEARCH_QDN_RESOURCES bridge call. */
export type QdnSearchFn = (params: {
  service: string;
  identifier: string;
  prefix?: boolean;
  limit: number;
  offset: number;
  reverse?: boolean;
  includeMetadata?: boolean;
}) => Promise<unknown[]>;

// ---- Defaults ----

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_SAFETY_MAX = 500;

// ---- Implementation ----

/**
 * Execute a paginated QDN search.
 *
 * Iterates with increasing offset until:
 *   1. A page returns fewer results than pageSize (exhausted)
 *   2. The total raw results reach safetyMax
 *   3. A repeated page is detected (same fingerprint as previous)
 *   4. The request is cancelled via AbortSignal
 *   5. A request fails
 *
 * Deduplicates exact metadata matches based on service+name+identifier+timestamps.
 */
export async function paginatedQdnSearch(
  searchFn: QdnSearchFn,
  params: PaginatedSearchParams,
): Promise<PaginatedQdnSearchResult> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const safetyMax = params.safetyMax ?? DEFAULT_SAFETY_MAX;
  const reverse = params.reverse ?? true;
  const includeMetadata = params.includeMetadata ?? true;
  const prefix = params.prefix ?? true;
  const filter = params.filter;
  const rawSafetyMax =
    params.rawSafetyMax ?? Math.max(safetyMax, safetyMax * 10);

  const diagnostics: QdnDiagnostic[] = [];
  const seen = new Set<string>();
  const items: QdnResourceMetadata[] = [];
  let offset = 0;
  let pagesRead = 0;
  let rawResultCount = 0;
  let deduplicatedCount = 0;
  let filteredCount = 0;
  let lastPageFingerprint: string | null = null;

  // Result order should be stable across pages when reverse: true:
  // newest-first on each page, pages also newest-first.
  // But Core returns newest-first per page by default, and we page
  // from offset 0 upward, so within a search all results are in
  // reverse chronological order.

  while (true) {
    // Check cancellation before each page
    if (params.signal?.aborted) {
      diagnostics.push(
        infoDiag('SEARCH_CANCELLED', 'Paginated search cancelled by signal.'),
      );
      return {
        items,
        complete: false,
        pagesRead,
        rawResultCount,
        deduplicatedCount,
        filteredCount,
        reason: 'cancelled',
        diagnostics,
      };
    }

    // Check the effective result budget before fetching the next page. When a
    // filter is present this counts only matching records, so child resources
    // cannot starve the parent family.
    if (items.length >= safetyMax) {
      diagnostics.push(
        warningDiag(
          'SAFETY_BUDGET_REACHED',
          `Safety budget of ${safetyMax} matching results reached. ${items.length} unique items retained.`,
        ),
      );
      return {
        items,
        complete: false,
        pagesRead,
        rawResultCount,
        deduplicatedCount,
        filteredCount,
        reason: 'safety-budget-reached',
        diagnostics,
      };
    }

    // Absolute raw safety cap keeps discovery bounded even when a filter
    // rejects most records and the matching set stays below safetyMax.
    if (rawResultCount >= rawSafetyMax) {
      diagnostics.push(
        warningDiag(
          'SAFETY_BUDGET_REACHED',
          `Raw safety budget of ${rawSafetyMax} records reached while filtering.`,
        ),
      );
      return {
        items,
        complete: false,
        pagesRead,
        rawResultCount,
        deduplicatedCount,
        filteredCount,
        reason: 'safety-budget-reached',
        diagnostics,
      };
    }

    let pageResults: unknown[];

    try {
      pageResults = await searchFn({
        service: params.service,
        identifier: params.identifier,
        prefix,
        limit: pageSize,
        offset,
        reverse,
        includeMetadata,
      });
    } catch (err) {
      if (isBridgeError(err) && err.code === 'TIMEOUT') {
        diagnostics.push(
          warningDiag(
            'SEARCH_TIMEOUT',
            `Search request timed out at offset ${offset}: ${err.message}`,
            { service: params.service, identifier: params.identifier },
          ),
        );
        return {
          items,
          complete: false,
          pagesRead,
          rawResultCount,
          deduplicatedCount,
          filteredCount,
          reason: 'timeout',
          diagnostics,
        };
      }

      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      diagnostics.push(
        warningDiag(
          'SEARCH_REQUEST_FAILED',
          `Search request failed at offset ${offset}: ${errMsg}`,
          { service: params.service, identifier: params.identifier },
        ),
      );
      return {
        items,
        complete: false,
        pagesRead,
        rawResultCount,
        deduplicatedCount,
        filteredCount,
        reason: 'request-failed',
        diagnostics,
      };
    }

    pagesRead++;

    // Validate response
    if (!Array.isArray(pageResults)) {
      diagnostics.push(
        warningDiag(
          'SEARCH_INVALID_RESPONSE',
          `Search response was not an array at offset ${offset}.`,
          { service: params.service, identifier: params.identifier },
        ),
      );
      return {
        items,
        complete: false,
        pagesRead,
        rawResultCount,
        deduplicatedCount,
        filteredCount,
        reason: 'invalid-response',
        diagnostics,
      };
    }

    // Detect repeated page (infinite loop protection)
    const pageFingerprint = pageResults
      .map((r) => {
        if (r && typeof r === 'object') {
          const rec = r as Record<string, unknown>;
          return `${rec.name ?? ''}|${rec.identifier ?? ''}`;
        }
        return '';
      })
      .sort()
      .join(';;');

    if (lastPageFingerprint === pageFingerprint && pageResults.length > 0) {
      diagnostics.push(
        warningDiag(
          'REPEATED_PAGE_DETECTED',
          `Page fingerprint unchanged at offset ${offset}. Stopping to prevent infinite loop.`,
          { service: params.service, identifier: params.identifier },
        ),
      );
      return {
        items,
        complete: false,
        pagesRead,
        rawResultCount,
        deduplicatedCount,
        filteredCount,
        reason: 'repeated-page',
        diagnostics,
      };
    }
    lastPageFingerprint = pageFingerprint;

    rawResultCount += pageResults.length;

    // Extract and deduplicate metadata
    for (const raw of pageResults) {
      const meta = extractMetadata(raw);
      if (!meta) continue;
      if (filter && !filter(meta)) {
        filteredCount++;
        continue;
      }

      const key = metadataDedupeKey(meta);
      if (seen.has(key)) {
        deduplicatedCount++;
        continue;
      }
      seen.add(key);
      items.push(meta);
    }

    // Exhaustion: fewer results than page size
    if (pageResults.length < pageSize) {
      diagnostics.push(
        infoDiag(
          'SEARCH_EXHAUSTED',
          `Search exhausted at offset ${offset}: ${pageResults.length} results on final page (page size ${pageSize}).`,
          { service: params.service, identifier: params.identifier },
        ),
      );
      return {
        items,
        complete: true,
        pagesRead,
        rawResultCount,
        deduplicatedCount,
        filteredCount,
        reason: 'exhausted',
        diagnostics,
      };
    }

    offset += pageSize;
  }
}
