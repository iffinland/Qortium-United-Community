// ===== Event Resource Policy =====

import type { ResourcePolicy } from '../ResourcePolicy';
import { eventSchema, type QucpEvent } from '../schemas/eventSchema';
import {
  parseWithZod,
  validateFamilyIdentifier,
  extractOwnerIdentity,
  validateEntityIdMatch,
  validateOwnerNameMatch,
  validatePublisherOwnership,
} from './authoritativeEntityPolicy';
import { extractEntityId } from '../identifiers/qucpIdentifiers';
import { ValidationReasonCodes } from '../validationTypes';
import { warningDiag } from '../diagnostics';

export const eventPolicy: ResourcePolicy<QucpEvent> = {
  family: 'qucp-event',

  parse(data: unknown) {
    return parseWithZod(eventSchema, data);
  },

  validateIdentifier(identifier: string) {
    return validateFamilyIdentifier(identifier, 'qucp-event');
  },

  extractEmbeddedIdentity(envelope) {
    return extractOwnerIdentity(envelope);
  },

  validatePublisher(envelope, identity) {
    const nameResult = validateOwnerNameMatch(envelope);
    if (!nameResult.valid) return nameResult;

    const walletResult = validatePublisherOwnership(envelope, identity);
    if (!walletResult.valid) return walletResult;

    const expectedEntityId = extractEntityId(envelope.metadata.identifier);
    if (!expectedEntityId) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [
          warningDiag(
            ValidationReasonCodes.IDENTIFIER_INVALID,
            `Could not extract entityId from identifier "${envelope.metadata.identifier}"`,
            envelope.metadata,
          ),
        ],
      };
    }
    return validateEntityIdMatch(envelope, expectedEntityId);
  },
};
