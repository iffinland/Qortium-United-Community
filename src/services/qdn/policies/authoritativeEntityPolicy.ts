// ===== Authoritative Entity Policy Helpers =====
//
// Shared logic for ResourcePolicy implementations across all
// authoritative entity families.

import type { ZodSchema } from 'zod';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { IdentityResolution } from '../IdentityResolver';
import type { PolicyParseResult, PolicyValidationResult } from '../ResourcePolicy';
import {
  ValidationReasonCodes,
} from '../validationTypes';
import { warningDiag } from '../diagnostics';
import { validateQucpIdentifier } from '../identifiers/qucpIdentifiers';
import type { QucpResourceFamily, AuthoritativeEntityBase } from '../schemas/commonSchemas';

// ---- Schema Parse Helper ----

/**
 * Parse raw data against a Zod schema, returning a PolicyParseResult.
 */
export function parseWithZod<T>(
  schema: ZodSchema<T>,
  data: unknown,
): PolicyParseResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const message = result.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
  return {
    success: false,
    reason: ValidationReasonCodes.SCHEMA_INVALID,
    message,
  };
}

// ---- Identifier Validation Helper ----

/**
 * Validate a QDN identifier for a specific resource family.
 */
export function validateFamilyIdentifier(
  identifier: string,
  family: QucpResourceFamily,
): PolicyValidationResult {
  const result = validateQucpIdentifier(identifier, family);
  if (!result.valid) {
    return {
      valid: false,
      reason: ValidationReasonCodes.IDENTIFIER_INVALID,
      diagnostics: [
        warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, result.reason, {
          identifier,
        }),
      ],
    };
  }
  return { valid: true };
}

// ---- Embedded Identity Extraction ----

/**
 * Extract embedded owner identity from an entity payload.
 * Works with any entity that has ownerName and ownerAddress fields.
 */
export function extractOwnerIdentity<T extends { ownerName: string; ownerAddress: string }>(
  envelope: QdnResourceEnvelope<T>,
): { authorName?: string; authorAddress?: string } {
  return {
    authorName: envelope.data.ownerName,
    authorAddress: envelope.data.ownerAddress,
  };
}

// ---- Entity ID Match ----

/**
 * Verify that the parsed entity ID matches the one extracted from the identifier.
 */
export function validateEntityIdMatch(
  envelope: QdnResourceEnvelope<AuthoritativeEntityBase>,
  entityIdFromIdentifier: string,
): PolicyValidationResult {
  if (envelope.data.entityId !== entityIdFromIdentifier) {
    return {
      valid: false,
      reason: ValidationReasonCodes.IDENTIFIER_INVALID,
      diagnostics: [
        warningDiag(
          ValidationReasonCodes.IDENTIFIER_INVALID,
          `Payload entityId "${envelope.data.entityId}" does not match identifier entityId "${entityIdFromIdentifier}"`,
          envelope.metadata,
        ),
      ],
    };
  }
  return { valid: true };
}

// ---- Publisher Validation ----

/**
 * Validate that the QDN publisher name matches the embedded owner name.
 */
export function validateOwnerNameMatch(
  envelope: QdnResourceEnvelope<{ ownerName: string }>,
): PolicyValidationResult {
  if (envelope.metadata.name !== envelope.data.ownerName) {
    return {
      valid: false,
      reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
      diagnostics: [
        warningDiag(
          ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          `Publisher name "${envelope.metadata.name}" does not match owner name "${envelope.data.ownerName}"`,
          envelope.metadata,
        ),
      ],
    };
  }
  return { valid: true };
}

/**
 * Validate that the resolved publisher wallet matches the embedded owner address.
 * Called by validatePublisher after identity resolution.
 */
export function validatePublisherOwnership(
  envelope: QdnResourceEnvelope<{ ownerAddress: string }>,
  identity: IdentityResolution,
): PolicyValidationResult {
  if (!identity.address) {
    return {
      valid: false,
      reason: ValidationReasonCodes.PUBLISHER_UNRESOLVED,
      diagnostics: [
        warningDiag(
          ValidationReasonCodes.PUBLISHER_UNRESOLVED,
          `Publisher "${envelope.metadata.name}" has no resolved wallet address`,
          envelope.metadata,
        ),
      ],
    };
  }

  if (identity.address !== envelope.data.ownerAddress) {
    return {
      valid: false,
      reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
      diagnostics: [
        warningDiag(
          ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          `Resolved wallet "${identity.address}" does not match owner address "${envelope.data.ownerAddress}"`,
          envelope.metadata,
        ),
      ],
    };
  }

  return { valid: true };
}
