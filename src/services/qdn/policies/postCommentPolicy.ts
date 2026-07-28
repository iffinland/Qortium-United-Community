// ===== Post Comment Resource Policy =====

import type { ResourcePolicy } from '../ResourcePolicy';
import { postCommentSchema, type QucpPostComment } from '../schemas/postCommentSchema';
import {
  parseWithZod,
  validateFamilyIdentifier,
  extractOwnerIdentity,
  validateOwnerNameMatch,
  validatePublisherOwnership,
} from './authoritativeEntityPolicy';
import { validateChildIdentifier } from '../identifiers/qucpIdentifiers';
import { validateParentReference } from '../ordering/parentReference';
import { ValidationReasonCodes } from '../validationTypes';
import { warningDiag } from '../diagnostics';

export const postCommentPolicy: ResourcePolicy<QucpPostComment> = {
  family: 'qucp-post-comment',

  parse(data: unknown) {
    return parseWithZod(postCommentSchema, data);
  },

  validateIdentifier(identifier: string) {
    return validateFamilyIdentifier(identifier, 'qucp-post-comment');
  },

  extractEmbeddedIdentity(envelope) {
    return extractOwnerIdentity(envelope);
  },

  validatePublisher(envelope, identity) {
    const nameResult = validateOwnerNameMatch(envelope);
    if (!nameResult.valid) return nameResult;

    const walletResult = validatePublisherOwnership(envelope, identity);
    if (!walletResult.valid) return walletResult;

    const idResult = validateChildIdentifier(envelope.metadata.identifier, 'qucp-post-comment');
    if (!idResult.valid) {
      return {
        valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, idResult.reason, envelope.metadata)],
      };
    }

    if (envelope.data.entityId !== idResult.entityId) {
      return {
        valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
          `Payload entityId mismatch: "${envelope.data.entityId}" vs "${idResult.entityId}"`, envelope.metadata)],
      };
    }

    const parentResult = validateParentReference(envelope.data.parentEntityId, envelope.data.entityId);
    if (!parentResult.valid) {
      return {
        valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, parentResult.reason, envelope.metadata)],
      };
    }

    return { valid: true };
  },
};
