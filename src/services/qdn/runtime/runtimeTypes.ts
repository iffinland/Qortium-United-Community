// ===== Runtime Types =====
//
// Shared runtime-level types for validated QDN query results.
// Derived from the foundation validation pipeline types.

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { ValidationDiagnostic } from '../validationTypes';

// ---- Query Completeness ----

export type QueryCompleteness = 'complete' | 'incomplete' | 'unavailable' | 'empty';

// ---- Runtime Diagnostic ----

export interface RuntimeDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  entityId?: string;
  publisherName?: string;
}

// ---- Validated Resource ----

export interface ValidatedResource<T> {
  envelope: QdnResourceEnvelope<T>;
  entityId: string;
  publisherName: string;
  publisherAddress: string;
}

// ---- Validated Query Result ----

/**
 * Discriminated result for a validated runtime query.
 *
 * - 'complete': all available metadata pages were fetched and validated
 * - 'incomplete': some results may be missing (safety budget, partial failure)
 * - 'unavailable': the query infrastructure itself failed
 * - 'empty': query succeeded but no resources matched
 */
export type ValidatedRuntimeQueryResult<T> =
  | {
      status: 'complete';
      items: ValidatedResource<T>[];
      rejectedCount: number;
      quarantinedCount: number;
      diagnostics: RuntimeDiagnostic[];
    }
  | {
      status: 'incomplete';
      items: ValidatedResource<T>[];
      rejectedCount: number;
      quarantinedCount: number;
      reason: string;
      diagnostics: RuntimeDiagnostic[];
    }
  | {
      status: 'unavailable';
      items: ValidatedResource<T>[];
      reason: string;
      diagnostics: RuntimeDiagnostic[];
    }
  | {
      status: 'empty';
      items: [];
      diagnostics: RuntimeDiagnostic[];
    };

// ---- Runtime Query Params ----

export interface RuntimeQueryParams {
  /** QDN service type (e.g. 'DOCUMENT') */
  service: string;
  /** QDN identifier prefix for search */
  identifierPrefix: string;
  /** Page size for paginated search */
  pageSize?: number;
  /** Safety budget (max raw results) */
  safetyMax?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

// ---- Canonical Identity ----

export interface CanonicalIdentity {
  publisherName: string;
  walletAddress: string;
}

// ---- View Model Base ----

export interface EntityViewModel {
  entityId: string;
  resourceFamily: string;
  canonicalOwner: CanonicalIdentity;
  isDeletedByOwner: boolean;
}

// ---- Helpers ----

export function toRuntimeDiagnostic(d: ValidationDiagnostic): RuntimeDiagnostic {
  return {
    level: d.level,
    code: d.code,
    message: d.message,
    entityId: d.identifier,
    publisherName: d.name,
  };
}

export function emptyResult<T>(): ValidatedRuntimeQueryResult<T> {
  return { status: 'empty', items: [], diagnostics: [] };
}
