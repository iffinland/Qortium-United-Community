// ===== Resource Policy Interface =====
//
// Generic contract that each resource family (posts, wiki, comments, etc.)
// implements. The shared validation pipeline uses this interface to
// apply domain-specific rules without encoding feature logic.

import type { QdnResourceEnvelope } from './QdnResourceEnvelope';
import type { IdentityResolution } from './IdentityResolver';
import type {
  ValidationDiagnostic,
  ValidationReasonCode,
} from './validationTypes';

// ---- Policy parse result ----

export interface PolicyParseResult<T> {
  success: boolean;
  data?: T;
  reason?: ValidationReasonCode;
  message?: string;
}

// ---- Policy validation result (non-blocking) ----

export interface PolicyValidationResult {
  valid: boolean;
  reason?: ValidationReasonCode;
  diagnostics?: ValidationDiagnostic[];
}

// ---- Resource policy interface ----

/**
 * Resource family policy contract.
 * Each resource type (post, wiki, comment, thread, ticket, etc.)
 * provides an implementation of this interface to the validation pipeline.
 */
export interface ResourcePolicy<T = unknown> {
  /** Human-readable family name for diagnostics (e.g. 'post', 'wiki'). */
  readonly family: string;

  /**
   * Parse raw (already-JSON-parsed) payload data into the typed shape.
   * The pipeline calls this after decoding the QDN resource payload.
   * Return { success: false } for schema-invalid data.
   */
  parse(data: unknown): PolicyParseResult<T>;

  /**
   * Validate the resource identifier format.
   * Called before the resource is fetched (from search result metadata).
   */
  validateIdentifier(identifier: string): PolicyValidationResult;

  /**
   * Optional: extract embedded identity fields from the parsed payload.
   * Used by the pipeline to compare against the resolved publisher identity.
   * Return undefined if this resource family does not have embedded identity.
   */
  extractEmbeddedIdentity?(
    envelope: QdnResourceEnvelope<T>,
  ): { authorName?: string; authorAddress?: string };

  /**
   * Optional: validate that the publisher is authorized for this resource.
   * Called after identity resolution.
   * Return { valid: true } if no publisher-specific checks are needed.
   */
  validatePublisher?(
    envelope: QdnResourceEnvelope<T>,
    identity: IdentityResolution,
  ): PolicyValidationResult | Promise<PolicyValidationResult>;
}
