// ===== Poll Reference Policy =====
//
// Validates that a QDN poll reference is structurally authentic.
// Publisher must match the reference's owner fields.
// Parent ownership is verified separately.

import type { ResourcePolicy } from '../ResourcePolicy';
import { pollReferenceSchema, type QucpPollReference } from '../schemas/pollReferenceSchema';
import { parseWithZod } from './authoritativeEntityPolicy';
import { parsePollReferenceIdentifier } from '../identifiers/pollReferenceIdentifiers';
import { ValidationReasonCodes } from '../validationTypes';
import { warningDiag } from '../diagnostics';

export const pollReferencePolicy: ResourcePolicy<QucpPollReference> = {
  family: 'qucp-poll-reference',

  parse(data: unknown) {
    return parseWithZod(pollReferenceSchema, data);
  },

  validateIdentifier(identifier: string) {
    const parsed = parsePollReferenceIdentifier(identifier);
    if (!parsed) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [
          warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
            `Poll reference identifier must match qucp-pr-{entityId}, got: ${identifier}`,
            { identifier }),
        ],
      };
    }
    return { valid: true };
  },

  extractEmbeddedIdentity(envelope) {
    return { authorName: envelope.data.ownerName, authorAddress: envelope.data.ownerAddress };
  },

  async validatePublisher(envelope, identity) {
    // 1. Identifier entityId must match payload entityId
    const parsed = parsePollReferenceIdentifier(envelope.metadata.identifier);
    if (!parsed || parsed.entityId !== envelope.data.entityId) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
          'Identifier entityId does not match payload entityId', envelope.metadata)],
      };
    }

    // 2. Publisher name must equal ownerName
    if (envelope.metadata.name !== envelope.data.ownerName) {
      return {
        valid: false,
        reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [warningDiag(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          'Publisher name does not match ownerName', envelope.metadata)],
      };
    }

    // 3. Resolved wallet must equal ownerAddress
    if (identity.address !== envelope.data.ownerAddress) {
      return {
        valid: false,
        reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [warningDiag(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          'Publisher wallet does not match ownerAddress', envelope.metadata)],
      };
    }

    return { valid: true };
  },
};
