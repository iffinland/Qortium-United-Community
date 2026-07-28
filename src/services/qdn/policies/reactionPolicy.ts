// ===== Reaction Resource Policy =====

import type { ResourcePolicy } from '../ResourcePolicy';
import { reactionSchema, type QucpReaction } from '../schemas/reactionSchema';
import { parseWithZod, validateFamilyIdentifier } from './authoritativeEntityPolicy';
import { parseReactionIdentifier } from '../identifiers/operationIdentifiers';
import { verifyReactionActorKey, verifyReactionTargetKey } from '../identifiers/operationKeys';
import { ValidationReasonCodes } from '../validationTypes';
import { warningDiag } from '../diagnostics';

export const reactionPolicy: ResourcePolicy<QucpReaction> = {
  family: 'qucp-reaction',

  parse(data: unknown) {
    return parseWithZod(reactionSchema, data);
  },

  validateIdentifier(identifier: string) {
    return validateFamilyIdentifier(identifier, 'qucp-reaction');
  },

  extractEmbeddedIdentity(envelope) {
    return { authorName: envelope.data.actorName, authorAddress: envelope.data.actorAddress };
  },

  async validatePublisher(envelope, identity) {
    if (envelope.metadata.name !== envelope.data.actorName) {
      return { valid: false, reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [warningDiag(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          `Publisher name mismatch`, envelope.metadata)] };
    }
    if (identity.address !== envelope.data.actorAddress) {
      return { valid: false, reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [warningDiag(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          `Wallet mismatch`, envelope.metadata)] };
    }

    const parsed = parseReactionIdentifier(envelope.metadata.identifier);
    if (!parsed) {
      return { valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, 'Bad reaction identifier', envelope.metadata)] };
    }
    if (!(await verifyReactionActorKey(parsed.actorKey, envelope.data.actorAddress))) {
      return { valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, 'Actor key mismatch', envelope.metadata)] };
    }
    if (!(await verifyReactionTargetKey(parsed.targetKey, envelope.data.targetFamily, envelope.data.targetEntityId))) {
      return { valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, 'Target key mismatch', envelope.metadata)] };
    }
    return { valid: true };
  },
};
