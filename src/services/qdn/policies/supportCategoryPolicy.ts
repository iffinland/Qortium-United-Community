// ===== Support Category Policy =====
//
// Only Admin or SysOp may publish authoritative category resources.

import type { ResourcePolicy } from '../ResourcePolicy';
import { supportCategorySchema, type QucpSupportCategory } from '../schemas/supportCategorySchema';
import {
  parseWithZod,
  validateFamilyIdentifier,
  extractOwnerIdentity,
  validateOwnerNameMatch,
  validatePublisherOwnership,
} from './authoritativeEntityPolicy';

export const supportCategoryPolicy: ResourcePolicy<QucpSupportCategory> = {
  family: 'qucp-support-category',

  parse(data: unknown) {
    return parseWithZod(supportCategorySchema, data);
  },

  validateIdentifier(identifier: string) {
    return validateFamilyIdentifier(identifier, 'qucp-support-category');
  },

  extractEmbeddedIdentity(envelope) {
    return extractOwnerIdentity(envelope);
  },

  validatePublisher(envelope, identity) {
    const nameResult = validateOwnerNameMatch(envelope);
    if (!nameResult.valid) return nameResult;

    const walletResult = validatePublisherOwnership(envelope, identity);
    if (!walletResult.valid) return walletResult;

    return { valid: true };
  },
};
