// ===== Media Reference Policy =====
//
// Validates that a media reference is published by its owner.

import type { ResourcePolicy } from '../ResourcePolicy';
import { mediaReferenceSchema, type QucpMediaReference } from '../schemas/mediaReferenceSchema';
import { parseWithZod } from './authoritativeEntityPolicy';
import { parseMediaReferenceIdentifier } from '../identifiers/mediaReferenceIdentifiers';
import { ValidationReasonCodes } from '../validationTypes';
import { warningDiag } from '../diagnostics';

export const mediaReferencePolicy: ResourcePolicy<QucpMediaReference> = {
  family: 'qucp-media-reference',

  parse(data: unknown) {
    return parseWithZod(mediaReferenceSchema, data);
  },

  validateIdentifier(identifier: string) {
    if (!parseMediaReferenceIdentifier(identifier)) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
          `Media reference identifier must match qucp-mr-{entityId}, got: ${identifier}`, { identifier })],
      };
    }
    return { valid: true };
  },

  extractEmbeddedIdentity(envelope) {
    return { authorName: envelope.data.ownerName, authorAddress: envelope.data.ownerAddress };
  },

  async validatePublisher(envelope, identity) {
    const parsed = parseMediaReferenceIdentifier(envelope.metadata.identifier);
    if (!parsed || parsed.entityId !== envelope.data.entityId) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
          'Identifier entityId does not match payload entityId', envelope.metadata)],
      };
    }
    if (envelope.metadata.name !== envelope.data.ownerName) {
      return {
        valid: false,
        reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [warningDiag(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          'Publisher name does not match ownerName', envelope.metadata)],
      };
    }
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
