// ===== Vote Resource Policy =====

import type { ResourcePolicy } from '../ResourcePolicy';
import { voteSchema, type QucpVote } from '../schemas/voteSchema';
import {
  parseWithZod,
  validateFamilyIdentifier,
  extractOwnerIdentity,
  validateOwnerNameMatch,
  validatePublisherOwnership,
} from './authoritativeEntityPolicy';

export const votePolicy: ResourcePolicy<QucpVote> = {
  family: 'qucp-vote',

  parse(data: unknown) {
    return parseWithZod(voteSchema, data);
  },

  validateIdentifier(identifier: string) {
    return validateFamilyIdentifier(identifier, 'qucp-vote');
  },

  extractEmbeddedIdentity(envelope) {
    return extractOwnerIdentity(envelope);
  },

  async validatePublisher(envelope, identity) {
    const nameResult = validateOwnerNameMatch(envelope);
    if (!nameResult.valid) return nameResult;

    const walletResult = validatePublisherOwnership(envelope, identity);
    if (!walletResult.valid) return walletResult;

    return { valid: true };
  },
};
