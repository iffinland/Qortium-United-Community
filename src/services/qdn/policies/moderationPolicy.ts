// ===== Moderation Operation Policy =====
//
// Structural authenticity validation for moderation operations.
// Proves WHO published the operation — does NOT alone prove authorization.
// Authorization against the trusted registry is a separate step.

import type { ResourcePolicy } from '../ResourcePolicy';
import { moderationOperationSchema, type QucpModerationOperation } from '../schemas/moderationOperationSchema';
import { parseWithZod } from './authoritativeEntityPolicy';
import { parseModerationIdentifier } from '../identifiers/moderationIdentifiers';
import { verifyModerationTargetKey, verifyModerationOperationKey } from '../identifiers/moderationKeys';
import { ValidationReasonCodes } from '../validationTypes';
import { warningDiag } from '../diagnostics';

export const moderationPolicy: ResourcePolicy<QucpModerationOperation> = {
  family: 'qucp-moderation',

  parse(data: unknown) {
    return parseWithZod(moderationOperationSchema, data);
  },

  validateIdentifier(identifier: string) {
    const parsed = parseModerationIdentifier(identifier);
    if (!parsed) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [
          warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
            'Moderation identifier does not match expected format', { identifier }),
        ],
      };
    }
    return { valid: true };
  },

  extractEmbeddedIdentity(envelope) {
    return { authorName: envelope.data.actorName, authorAddress: envelope.data.actorAddress };
  },

  async validatePublisher(envelope, identity) {
    // 1. Publisher name must equal actorName
    if (envelope.metadata.name !== envelope.data.actorName) {
      return {
        valid: false,
        reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [warningDiag(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          'Publisher name does not match actorName', envelope.metadata)],
      };
    }

    // 2. Resolved wallet must equal actorAddress
    if (identity.address !== envelope.data.actorAddress) {
      return {
        valid: false,
        reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [warningDiag(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          'Publisher wallet does not match actorAddress', envelope.metadata)],
      };
    }

    // 3. Identifier must parse
    const parsed = parseModerationIdentifier(envelope.metadata.identifier);
    if (!parsed) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
          'Bad moderation identifier', envelope.metadata)],
      };
    }

    // 4. Target key must bind to targetFamily + targetEntityId
    if (!(await verifyModerationTargetKey(parsed.targetKey, envelope.data.targetFamily, envelope.data.targetEntityId))) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
          'Target key mismatch', envelope.metadata)],
      };
    }

    // 5. Operation key must bind to operationId + actorAddress + action + registrySnapshotId
    if (!(await verifyModerationOperationKey(
      parsed.operationKey, envelope.data.operationId, envelope.data.actorAddress, envelope.data.action, envelope.data.registrySnapshotId,
    ))) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
          'Operation key mismatch (snapshot binding)', envelope.metadata)],
      };
    }

    return { valid: true };
  },
};
