// ===== Support Ticket Status Resource Policy =====

import type { ResourcePolicy } from '../ResourcePolicy';
import {
  supportTicketStatusSchema,
  type QucpSupportTicketStatus,
} from '../schemas/supportTicketStatusSchema';
import { parseWithZod } from './authoritativeEntityPolicy';
import {
  parseSupportTicketCloseIdentifier,
} from '../identifiers/operationIdentifiers';
import {
  verifyTicketCloseActorKey,
  verifyTicketCloseTargetKey,
} from '../identifiers/operationKeys';
import { ValidationReasonCodes } from '../validationTypes';
import { warningDiag } from '../diagnostics';

export const supportTicketStatusPolicy: ResourcePolicy<QucpSupportTicketStatus> = {
  family: 'qucp-support-ticket-status',

  parse(data: unknown) {
    return parseWithZod(supportTicketStatusSchema, data);
  },

  validateIdentifier(identifier: string) {
    const parsed = parseSupportTicketCloseIdentifier(identifier);
    if (!parsed) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [
          warningDiag(
            ValidationReasonCodes.IDENTIFIER_INVALID,
            `Support ticket close identifier must match qucp-stc-{26hex}-{26hex}, got: ${identifier}`,
            { identifier },
          ),
        ],
      };
    }
    return { valid: true };
  },

  extractEmbeddedIdentity(envelope) {
    return {
      authorName: envelope.data.actorName,
      authorAddress: envelope.data.actorAddress,
    };
  },

  async validatePublisher(envelope, identity) {
    if (envelope.metadata.name !== envelope.data.actorName) {
      return {
        valid: false,
        reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [
          warningDiag(
            ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
            'Support ticket close publisher name mismatch',
            envelope.metadata,
          ),
        ],
      };
    }

    if (identity.address !== envelope.data.actorAddress) {
      return {
        valid: false,
        reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [
          warningDiag(
            ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
            'Support ticket close publisher wallet mismatch',
            envelope.metadata,
          ),
        ],
      };
    }

    const parsed = parseSupportTicketCloseIdentifier(envelope.metadata.identifier);
    if (!parsed) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [
          warningDiag(
            ValidationReasonCodes.IDENTIFIER_INVALID,
            'Bad support ticket close identifier',
            envelope.metadata,
          ),
        ],
      };
    }

    if (!(await verifyTicketCloseActorKey(parsed.actorKey, envelope.data.actorAddress))) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [
          warningDiag(
            ValidationReasonCodes.IDENTIFIER_INVALID,
            'Support ticket close actor key mismatch',
            envelope.metadata,
          ),
        ],
      };
    }

    if (!(await verifyTicketCloseTargetKey(
      parsed.targetKey,
      envelope.data.targetFamily,
      envelope.data.targetEntityId,
    ))) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [
          warningDiag(
            ValidationReasonCodes.IDENTIFIER_INVALID,
            'Support ticket close target key mismatch',
            envelope.metadata,
          ),
        ],
      };
    }

    return { valid: true };
  },
};
