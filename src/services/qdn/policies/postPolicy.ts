// ===== Post Resource Policy =====

import type { ResourcePolicy } from '../ResourcePolicy';
import { postSchema, type QucpPost } from '../schemas/postSchema';
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

export const postPolicy: ResourcePolicy<QucpPost> = {
  family: 'qucp-post',

  parse(data: unknown) {
    return parseWithZod(postSchema, data);
  },

  validateIdentifier(identifier: string) {
    return validateFamilyIdentifier(identifier, 'qucp-post');
  },

  extractEmbeddedIdentity(envelope) {
    return extractOwnerIdentity(envelope);
  },

  validatePublisher(envelope, identity) {
    // 1. Owner name must match publisher name
    const nameResult = validateOwnerNameMatch(envelope);
    if (!nameResult.valid) return nameResult;

    // 2. Owner address must match resolved wallet
    const walletResult = validatePublisherOwnership(envelope, identity);
    if (!walletResult.valid) return walletResult;

    // 3. Entity ID in payload must match identifier
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
