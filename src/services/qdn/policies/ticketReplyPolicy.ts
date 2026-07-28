// ===== Ticket Reply Resource Policy =====

import type { ResourcePolicy } from '../ResourcePolicy';
import { ticketReplySchema, type QucpTicketReply } from '../schemas/ticketReplySchema';
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

export const ticketReplyPolicy: ResourcePolicy<QucpTicketReply> = {
  family: 'qucp-ticket-reply',

  parse(data: unknown) {
    return parseWithZod(ticketReplySchema, data);
  },

  validateIdentifier(identifier: string) {
    return validateFamilyIdentifier(identifier, 'qucp-ticket-reply');
  },

  extractEmbeddedIdentity(envelope) {
    return extractOwnerIdentity(envelope);
  },

  validatePublisher(envelope, identity) {
    const nameResult = validateOwnerNameMatch(envelope);
    if (!nameResult.valid) return nameResult;

    const walletResult = validatePublisherOwnership(envelope, identity);
    if (!walletResult.valid) return walletResult;

    const idResult = validateChildIdentifier(envelope.metadata.identifier, 'qucp-ticket-reply');
    if (!idResult.valid) {
      return {
        valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, idResult.reason, envelope.metadata)],
      };
    }

    if (envelope.data.entityId !== idResult.entityId) {
      return {
        valid: false, reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID, `Payload entityId mismatch`, envelope.metadata)],
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
