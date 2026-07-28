// ===== QDN Validation Types =====
//
// Shared validation states, reason codes, and result types
// used by the validation pipeline and resource policies.

import type { QdnResourceEnvelope } from './QdnResourceEnvelope';

// ---- Validation States ----

/** Top-level validation outcome. */
export type ValidationStatus = 'accepted' | 'rejected' | 'quarantined';

// ---- Validation Reason Codes ----

export const ValidationReasonCodes = {
  // Schema / Data
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  MALFORMED_PAYLOAD: 'MALFORMED_PAYLOAD',

  // Identifier
  IDENTIFIER_INVALID: 'IDENTIFIER_INVALID',

  // Publisher
  PUBLISHER_MISSING: 'PUBLISHER_MISSING',
  PUBLISHER_UNRESOLVED: 'PUBLISHER_UNRESOLVED',
  PUBLISHER_LOOKUP_FAILED: 'PUBLISHER_LOOKUP_FAILED',

  // Identity
  EMBEDDED_IDENTITY_MISMATCH: 'EMBEDDED_IDENTITY_MISMATCH',
  UNAUTHORIZED_PUBLISHER: 'UNAUTHORIZED_PUBLISHER',

  // Resource availability
  RESOURCE_UNAVAILABLE: 'RESOURCE_UNAVAILABLE',

  // Policy
  POLICY_ERROR: 'POLICY_ERROR',
  POLICY_REJECTED: 'POLICY_REJECTED',

  // Unknown / unexpected
  UNKNOWN: 'UNKNOWN',
} as const;

export type ValidationReasonCode =
  (typeof ValidationReasonCodes)[keyof typeof ValidationReasonCodes];

// ---- Validation Diagnostic ----

export interface ValidationDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: ValidationReasonCode | string;
  message: string;
  service?: string;
  name?: string;
  identifier?: string;
}

// ---- Validation Results ----

export interface AcceptedValidation<T> {
  status: 'accepted';
  envelope: QdnResourceEnvelope<T>;
  diagnostics: ValidationDiagnostic[];
}

export interface RejectedValidation {
  status: 'rejected';
  reason: ValidationReasonCode;
  diagnostics: ValidationDiagnostic[];
}

export interface QuarantinedValidation<T> {
  status: 'quarantined';
  reason: ValidationReasonCode;
  /** The envelope may be present (e.g. when identity lookup failed but data is intact) */
  envelope?: QdnResourceEnvelope<T>;
  diagnostics: ValidationDiagnostic[];
}

export type ValidationResult<T> =
  | AcceptedValidation<T>
  | RejectedValidation
  | QuarantinedValidation<T>;

// ---- Helpers ----

export function accepted<T>(
  envelope: QdnResourceEnvelope<T>,
  diagnostics?: ValidationDiagnostic[],
): AcceptedValidation<T> {
  return { status: 'accepted', envelope, diagnostics: diagnostics ?? [] };
}

export function rejected(
  reason: ValidationReasonCode,
  diagnostics?: ValidationDiagnostic[],
): RejectedValidation {
  return { status: 'rejected', reason, diagnostics: diagnostics ?? [] };
}

export function quarantined<T>(
  reason: ValidationReasonCode,
  envelope?: QdnResourceEnvelope<T>,
  diagnostics?: ValidationDiagnostic[],
): QuarantinedValidation<T> {
  return {
    status: 'quarantined',
    reason,
    envelope,
    diagnostics: diagnostics ?? [],
  };
}

// ---- Validation Batch Result ----

export interface ValidationBatchResult<T> {
  accepted: AcceptedValidation<T>[];
  rejected: RejectedValidation[];
  quarantined: QuarantinedValidation<T>[];
  total: number;
}
