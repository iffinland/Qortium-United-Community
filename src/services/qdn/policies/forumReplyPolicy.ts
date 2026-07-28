// ===== Forum Reply Resource Policy =====

import type { ResourcePolicy } from '../ResourcePolicy';
import { forumReplySchema, type QucpForumReply } from '../schemas/forumReplySchema';
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

export const forumReplyPolicy: ResourcePolicy<QucpForumReply> = {
  family: 'qucp-forum-reply',

  parse(data: unknown) {
    return parseWithZod(forumReplySchema, data);
  },

  validateIdentifier(identifier: string) {
    return validateFamilyIdentifier(identifier, 'qucp-forum-reply');
  },

  extractEmbeddedIdentity(envelope) {
    return extractOwnerIdentity(envelope);
  },

  validatePublisher(envelope, identity) {
    const nameResult = validateOwnerNameMatch(envelope);
    if (!nameResult.valid) return nameResult;

    const walletResult = validatePublisherOwnership(envelope, identity);
    if (!walletResult.valid) return walletResult;

    const idResult = validateChildIdentifier(envelope.metadata.identifier, 'qucp-forum-reply');
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
          `Payload entityId mismatch`, envelope.metadata)],
      };
    }

    const parentResult = validateParentReference(envelope.data.parentEntityId, envelope.data.entityId);
    if (!parentResult.valid) {
      return {
        valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, parentResult.reason, envelope.metadata)],
      };
    }

    if (envelope.data.parentReplyId && envelope.data.parentReplyId === envelope.data.entityId) {
      return {
        valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
          'parentReplyId cannot reference itself', envelope.metadata)],
      };
    }

    return { valid: true };
  },
};
