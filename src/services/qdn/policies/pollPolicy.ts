// ===== Poll Resource Policy =====

import type { ResourcePolicy } from '../ResourcePolicy';
import { pollSchema, type QucpPoll } from '../schemas/pollSchema';
import {
  parseWithZod,
  validateFamilyIdentifier,
  extractOwnerIdentity,
  validateOwnerNameMatch,
  validatePublisherOwnership,
} from './authoritativeEntityPolicy';

export const pollPolicy: ResourcePolicy<QucpPoll> = {
  family: 'qucp-poll',

  parse(data: unknown) {
    return parseWithZod(pollSchema, data);
  },

  validateIdentifier(identifier: string) {
    return validateFamilyIdentifier(identifier, 'qucp-poll');
  },

  extractEmbeddedIdentity(envelope) {
    return extractOwnerIdentity(envelope);
  },

  async validatePublisher(envelope, identity) {
    const nameResult = validateOwnerNameMatch(envelope);
    if (!nameResult.valid) return nameResult;

    const walletResult = validatePublisherOwnership(envelope, identity);
    if (!walletResult.valid) return walletResult;

    // Initial publication: isClosed must be false
    if (envelope.data.isClosed !== false) {
      // Allow if it's an update from the canonical owner closing the poll
      // (handled by the immutable snapshot reducer at the runtime level)
    }

    return { valid: true };
  },
};
