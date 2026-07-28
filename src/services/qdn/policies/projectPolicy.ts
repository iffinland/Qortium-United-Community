// ===== Project Resource Policy =====

import type { ResourcePolicy } from '../ResourcePolicy';
import { projectSchema, type QucpProject } from '../schemas/projectSchema';
import {
  parseWithZod,
  validateFamilyIdentifier,
  extractOwnerIdentity,
  validateOwnerNameMatch,
  validatePublisherOwnership,
} from './authoritativeEntityPolicy';

export const projectPolicy: ResourcePolicy<QucpProject> = {
  family: 'qucp-project',

  parse(data: unknown) {
    return parseWithZod(projectSchema, data);
  },

  validateIdentifier(identifier: string) {
    return validateFamilyIdentifier(identifier, 'qucp-project');
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
