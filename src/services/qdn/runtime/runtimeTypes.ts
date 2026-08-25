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
  /**
   * Optional fail-closed authority provider for admin-managed families.
   * When present, every accepted resource is also checked against canonical
   * role history at its trusted mutation/publication time.
   */
  adminAuthority?: AdminAuthorityProvider;
  /**
   * When true, canonical selection for a shared entity ID is the latest
   * authorized mutation regardless of publisher, rather than creator-owned.
   */
  sharedAdminOwnership?: boolean;
}

// ---- Admin Authority ----

export interface AdminAuthorityContext {
  publisherWallet: string;
  mutationQdnTime: number | undefined;
}

export type AdminAuthorityDecision =
  | { authorized: true }
  | { authorized: false; reason: string; detail?: string };

/**
 * Status of the role-history dependency backing an Admin-authority provider.
 *
 * - `complete`: role history was fully discovered and its lineage is valid.
 * - `incomplete`: role history discovery is incomplete.
 * - `unavailable`: role history discovery infrastructure failed.
 * - `invalid`: role history is present but its lineage is ambiguous (multiple
 *   genesis, missing predecessor, cycle, or fork).
 */
export type AuthorityDependencyStatus =
  | 'complete'
  | 'incomplete'
  | 'unavailable'
  | 'invalid';

/**
 * An authority provider is still callable per resource, but it also exposes the
 * role-history dependency status so the shared result classifier can carry a
 * degraded authority dependency into `incomplete`/`unavailable` instead of
 * silently collapsing rejected Admin-managed resources into `empty`.
 */
export type AdminAuthorityProvider = ((
  input: AdminAuthorityContext,
) => AdminAuthorityDecision) & {
  readonly dependency: AuthorityDependencyStatus;
};

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

// ---- Canonical Result-State Classification ----

export interface RuntimeQueryEvidence<T> {
  items: ValidatedResource<T>[];
  rejectedCount: number;
  quarantinedCount: number;
  /**
   * Number of quarantined items caused by publisher identity lookup failures.
   * These are infrastructure failures, not legitimate "unresolved" identities.
   */
  identityLookupFailedCount: number;
  searchComplete: boolean;
  searchReason?: string;
  fetchComplete: boolean;
  /** True when discovery produced items but none could be fetched. */
  allFetchesFailed: boolean;
  /**
   * Optional role-history authority dependency status. When present and not
   * `complete`, zero accepted resources must never be reported as valid `empty`.
   */
  authorityDependency?: AuthorityDependencyStatus;
  diagnostics: RuntimeDiagnostic[];
}

/**
 * Reduce pipeline evidence into the canonical runtime result vocabulary:
 *
 *   complete    — every searched/fetched resource was evaluated without an
 *                 infrastructure failure and at least one accepted resource
 *                 remains.
 *   empty       — discovery and fetch completed and zero authoritative
 *                 resources remain after validation.
 *   incomplete  — some evidence is missing, so a complete answer cannot be
 *                 claimed.
 *   unavailable — bridge/Core/fetch/identity infrastructure prevented a
 *                 trustworthy result.
 *
 * Identity infrastructure failures are never converted into a valid-empty
 * domain result, and a partial fetch is never reported as complete.
 */
export function classifyRuntimeQuery<T>(
  evidence: RuntimeQueryEvidence<T>,
): ValidatedRuntimeQueryResult<T> {
  const {
    items,
    rejectedCount,
    quarantinedCount,
    identityLookupFailedCount,
    searchComplete,
    searchReason,
    fetchComplete,
    allFetchesFailed,
    authorityDependency,
    diagnostics,
  } = evidence;

  if (allFetchesFailed) {
    return {
      status: 'unavailable',
      items: [],
      reason: 'All discovered resources failed to fetch from the QDN bridge.',
      diagnostics: [
        ...diagnostics,
        {
          level: 'error',
          code: 'FETCH_ALL_FAILED',
          message: 'No resource payloads could be retrieved.',
        },
      ],
    };
  }

  const authorityDegraded =
    authorityDependency !== undefined && authorityDependency !== 'complete';

  if (items.length === 0) {
    if (identityLookupFailedCount > 0) {
      return {
        status: 'unavailable',
        items: [],
        reason:
          'Publisher identity infrastructure was unavailable, so the domain result cannot be trusted.',
        diagnostics,
      };
    }

    if (authorityDependency === 'unavailable') {
      return {
        status: 'unavailable',
        items: [],
        reason:
          'Admin authority evidence was unavailable, so the domain result cannot be trusted.',
        diagnostics,
      };
    }

    if (authorityDegraded) {
      return {
        status: 'incomplete',
        items: [],
        rejectedCount,
        quarantinedCount,
        reason: 'Admin authority evidence is incomplete; a trustworthy empty result cannot be claimed.',
        diagnostics,
      };
    }

    if (!searchComplete || !fetchComplete) {
      return {
        status: 'incomplete',
        items: [],
        rejectedCount,
        quarantinedCount,
        reason: incompleteReason({
          searchComplete,
          searchReason,
          fetchComplete,
          identityLookupFailedCount,
        }),
        diagnostics,
      };
    }

    return {
      status: 'empty',
      items: [],
      diagnostics,
    };
  }

  if (
    !searchComplete ||
    !fetchComplete ||
    identityLookupFailedCount > 0 ||
    authorityDegraded
  ) {
    return {
      status: 'incomplete',
      items,
      rejectedCount,
      quarantinedCount,
      reason: incompleteReason({
        searchComplete,
        searchReason,
        fetchComplete,
        identityLookupFailedCount,
        authorityDependency,
      }),
      diagnostics,
    };
  }

  return {
    status: 'complete',
    items,
    rejectedCount,
    quarantinedCount,
    diagnostics,
  };
}

function incompleteReason(input: {
  searchComplete: boolean;
  searchReason?: string;
  fetchComplete: boolean;
  identityLookupFailedCount: number;
  authorityDependency?: AuthorityDependencyStatus;
}): string {
  if (input.authorityDependency === 'unavailable') {
    return 'Admin authority evidence was unavailable; some content may be missing.';
  }
  if (input.authorityDependency === 'incomplete' || input.authorityDependency === 'invalid') {
    return 'Admin authority evidence is degraded; some content may be missing.';
  }
  if (!input.searchComplete) {
    return input.searchReason ?? 'Incomplete metadata discovery.';
  }
  if (!input.fetchComplete) {
    return 'Some discovered resources could not be fetched.';
  }
  if (input.identityLookupFailedCount > 0) {
    return 'Some publisher identities could not be resolved.';
  }
  return 'Incomplete resource evidence.';
}
