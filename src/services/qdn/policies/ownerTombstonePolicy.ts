// ===== Owner Tombstone Resource Policy =====

import type { ResourcePolicy } from '../ResourcePolicy';
import { ownerTombstoneSchema, type QucpOwnerTombstone } from '../schemas/ownerTombstoneSchema';
import { parseWithZod } from './authoritativeEntityPolicy';
import { parseOwnerTombstoneIdentifier } from '../identifiers/operationIdentifiers';
import { verifyTombstoneOwnerKey, verifyTombstoneTargetKey } from '../identifiers/operationKeys';
import { ValidationReasonCodes } from '../validationTypes';
import { warningDiag } from '../diagnostics';

export const ownerTombstonePolicy: ResourcePolicy<QucpOwnerTombstone> = {
  family: 'qucp-owner-tombstone',

  parse(data: unknown) {
    return parseWithZod(ownerTombstoneSchema, data);
  },

  validateIdentifier(identifier: string) {
    // Owner tombstones are operation resources, not authoritative entities.
    // They use the dedicated qucp-ot-{targetKey}-{ownerKey} identifier shape
    // rather than qucp-owner-tombstone-{entityId}.
    const parsed = parseOwnerTombstoneIdentifier(identifier);
    if (!parsed) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [
          warningDiag(
            ValidationReasonCodes.IDENTIFIER_INVALID,
            `Owner tombstone identifier must match qucp-ot-{26hex}-{26hex}, got: ${identifier}`,
            { identifier },
          ),
        ],
      };
    }
    return { valid: true };
  },

  extractEmbeddedIdentity(envelope) {
    return { authorName: envelope.data.ownerName, authorAddress: envelope.data.ownerAddress };
  },

  async validatePublisher(envelope, identity) {
    if (envelope.metadata.name !== envelope.data.ownerName) {
      return { valid: false, reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [warningDiag(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH, `Publisher name mismatch`, envelope.metadata)] };
    }
    if (identity.address !== envelope.data.ownerAddress) {
      return { valid: false, reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [warningDiag(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH, `Wallet mismatch`, envelope.metadata)] };
    }

    const parsed = parseOwnerTombstoneIdentifier(envelope.metadata.identifier);
    if (!parsed) {
      return { valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, 'Bad tombstone identifier', envelope.metadata)] };
    }
    if (!(await verifyTombstoneOwnerKey(parsed.ownerKey, envelope.data.ownerAddress))) {
      return { valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, 'Owner key mismatch', envelope.metadata)] };
    }
    if (!(await verifyTombstoneTargetKey(parsed.targetKey, envelope.data.targetFamily, envelope.data.targetEntityId))) {
      return { valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, 'Target key mismatch', envelope.metadata)] };
    }
    return { valid: true };
  },
};
