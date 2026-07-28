// ===== Validation Pipeline =====
//
// Generic pipeline that processes QDN resource envelopes through:
//   1. Schema / policy parsing
//   2. Identifier validation
//   3. Identity resolution
//   4. Publisher authorization (via policy)
//
// Returns accepted, rejected, or quarantined results.

import type { QdnResourceEnvelope } from './QdnResourceEnvelope';
import type { IdentityResolver } from './IdentityResolver';
import type { ResourcePolicy } from './ResourcePolicy';
import {
  ValidationReasonCodes,
  type ValidationDiagnostic,
  type ValidationResult,
  accepted,
  rejected,
  quarantined,
} from './validationTypes';
import { warningDiag } from './diagnostics';

// ---- Pipeline Result ----

export interface PipelineResult<T> {
  results: ValidationResult<T>[];
  diagnostics: ValidationDiagnostic[];
}

// ---- Validation Stage Order ----

/*
 * Validation stages (in order):
 *
 * 1. SCHEMA VALIDATION
 *    Call policy.parse(envelope.data).
 *    If invalid → REJECTED (SCHEMA_INVALID)
 *
 * 2. IDENTIFIER VALIDATION
 *    Call policy.validateIdentifier(envelope.metadata.identifier).
 *    If invalid → REJECTED (IDENTIFIER_INVALID)
 *
 * 3. IDENTITY RESOLUTION
 *    Call identityResolver.resolve(envelope.metadata.name).
 *    If failed → QUARANTINED (PUBLISHER_LOOKUP_FAILED)
 *    If unresolved → QUARANTINED (PUBLISHER_UNRESOLVED)
 *
 * 4. EMBEDDED IDENTITY VALIDATION (if policy has extractEmbeddedIdentity)
 *    Extract embedded author/address from parsed payload.
 *    Compare with resolved publisher wallet.
 *    If mismatch → REJECTED (EMBEDDED_IDENTITY_MISMATCH)
 *
 * 5. PUBLISHER AUTHORIZATION (if policy has validatePublisher)
 *    Call policy.validatePublisher(envelope, identity).
 *    If invalid → REJECTED (reason from policy)
 *
 * 6. ACCEPTED
 */

// ---- Implementation ----

/**
 * Validate a single resource envelope through the pipeline.
 * Returns accepted, rejected, or quarantined result.
 * Does NOT throw for ordinary invalid resources.
 */
export async function validateResource<T>(
  envelope: QdnResourceEnvelope<unknown>,
  policy: ResourcePolicy<T>,
  identityResolver: IdentityResolver,
): Promise<ValidationResult<T>> {
  const diags: ValidationDiagnostic[] = [];

  // --- Stage 1: Schema Validation ---
  const parseResult = policy.parse(envelope.data);
  if (!parseResult.success) {
    diags.push(
      warningDiag(
        parseResult.reason ?? ValidationReasonCodes.SCHEMA_INVALID,
        parseResult.message ?? `Schema validation failed for ${policy.family}`,
        envelope.metadata,
      ),
    );
    return rejected(
      parseResult.reason ?? ValidationReasonCodes.SCHEMA_INVALID,
      diags,
    );
  }

  const typedEnvelope: QdnResourceEnvelope<T> = {
    ...envelope,
    data: parseResult.data as T,
  };

  // --- Stage 2: Identifier Validation ---
  const idResult = policy.validateIdentifier(envelope.metadata.identifier);
  if (!idResult.valid) {
    diags.push(
      warningDiag(
        idResult.reason ?? ValidationReasonCodes.IDENTIFIER_INVALID,
        `Identifier validation failed for ${policy.family}: ${envelope.metadata.identifier}`,
        envelope.metadata,
      ),
    );
    return rejected(
      idResult.reason ?? ValidationReasonCodes.IDENTIFIER_INVALID,
      diags,
    );
  }

  // --- Stage 3: Identity Resolution ---
  const identity = await identityResolver.resolve(envelope.metadata.name);

  if (identity.status === 'failed') {
    diags.push(
      warningDiag(
        ValidationReasonCodes.PUBLISHER_LOOKUP_FAILED,
        `Publisher name lookup failed for "${envelope.metadata.name}": ${identity.error ?? 'unknown error'}`,
        envelope.metadata,
      ),
    );
    return quarantined(
      ValidationReasonCodes.PUBLISHER_LOOKUP_FAILED,
      typedEnvelope,
      diags,
    );
  }

  if (identity.status === 'unresolved') {
    diags.push(
      warningDiag(
        ValidationReasonCodes.PUBLISHER_UNRESOLVED,
        `Publisher name "${envelope.metadata.name}" could not be resolved to a wallet.`,
        envelope.metadata,
      ),
    );
    return quarantined(
      ValidationReasonCodes.PUBLISHER_UNRESOLVED,
      typedEnvelope,
      diags,
    );
  }

  // Attach resolved address to envelope
  const resolvedEnvelope: QdnResourceEnvelope<T> = {
    ...typedEnvelope,
    resolvedPublisherAddress: identity.address,
  };

  // --- Stage 4: Embedded Identity Validation ---
  if (policy.extractEmbeddedIdentity) {
    const embedded = policy.extractEmbeddedIdentity(resolvedEnvelope);

    if (
      embedded.authorAddress &&
      identity.address &&
      embedded.authorAddress !== identity.address
    ) {
      diags.push(
        warningDiag(
          ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          `Embedded author address "${embedded.authorAddress}" does not match resolved publisher wallet "${identity.address}"`,
          envelope.metadata,
        ),
      );
      return rejected(
        ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diags,
      );
    }
  }

  // --- Stage 5: Publisher Authorization ---
  if (policy.validatePublisher) {
    const authResult = await policy.validatePublisher(resolvedEnvelope, identity);
    if (!authResult.valid) {
      diags.push(
        warningDiag(
          authResult.reason ?? ValidationReasonCodes.UNAUTHORIZED_PUBLISHER,
          `Publisher authorization failed for ${policy.family}: ${envelope.metadata.name}`,
          envelope.metadata,
        ),
      );
      return rejected(
        authResult.reason ?? ValidationReasonCodes.UNAUTHORIZED_PUBLISHER,
        diags,
      );
    }
  }

  // --- Stage 6: Accepted ---
  return accepted(resolvedEnvelope, diags);
}

/**
 * Validate a batch of resource envelopes.
 * Results maintain input order. Each resource is validated independently.
 */
export async function validateBatch<T>(
  envelopes: QdnResourceEnvelope<unknown>[],
  policy: ResourcePolicy<T>,
  identityResolver: IdentityResolver,
): Promise<PipelineResult<T>> {
  const results: ValidationResult<T>[] = [];
  const diagnostics: ValidationDiagnostic[] = [];

  for (const envelope of envelopes) {
    try {
      const result = await validateResource(envelope, policy, identityResolver);
      results.push(result);
      if ('diagnostics' in result) {
        diagnostics.push(...result.diagnostics);
      }
    } catch (err) {
      // Unexpected pipeline failure — treat as rejected
      const errMsg =
        err instanceof Error ? err.message : 'Unexpected pipeline error';
      diagnostics.push(
        warningDiag(
          ValidationReasonCodes.POLICY_ERROR,
          `Unexpected pipeline error for ${policy.family}: ${errMsg}`,
          envelope.metadata,
        ),
      );
      results.push(
        rejected(ValidationReasonCodes.POLICY_ERROR, [
          warningDiag(
            ValidationReasonCodes.POLICY_ERROR,
            `Pipeline exception: ${errMsg}`,
            envelope.metadata,
          ),
        ]),
      );
    }
  }

  return { results, diagnostics };
}
