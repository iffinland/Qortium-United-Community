// ===== Role Snapshot Policy =====
//
// Validates that a published role snapshot is authoritative.
// Only a QDN name owned by the configured SysOp wallet may publish.
// Each snapshot has its own immutable identifier.

import type { ResourcePolicy } from '../ResourcePolicy';
import { roleRegistrySnapshotSchema, type QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';
import { parseWithZod } from './authoritativeEntityPolicy';
import {
  parseRoleSnapshotIdentifier, verifyRoleSnapshotKey,
} from '../identifiers/roleSnapshotIdentifiers';
import { QUC_SYSOP_ADDRESS } from '../../../config/qortiumTrust';
import { ValidationReasonCodes } from '../validationTypes';
import { warningDiag } from '../diagnostics';

export const roleSnapshotPolicy: ResourcePolicy<QucpRoleRegistrySnapshot> = {
  family: 'qucp-role-snapshot',

  parse(data: unknown) {
    return parseWithZod(roleRegistrySnapshotSchema, data);
  },

  validateIdentifier(identifier: string) {
    const parsed = parseRoleSnapshotIdentifier(identifier);
    if (!parsed) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [
          warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
            `Role snapshot identifier must match qucp-rs-{26hex}, got: ${identifier}`,
            { identifier }),
        ],
      };
    }
    return { valid: true };
  },

  async validatePublisher(envelope, identity) {
    // 1. Publisher name must be present
    if (!envelope.metadata.name) {
      return {
        valid: false,
        reason: ValidationReasonCodes.PUBLISHER_MISSING,
        diagnostics: [warningDiag(ValidationReasonCodes.PUBLISHER_MISSING,
          'Role snapshot requires a publisher name', envelope.metadata)],
      };
    }

    // 2. Resolved wallet must equal configured SysOp wallet
    if (identity.address !== QUC_SYSOP_ADDRESS) {
      return {
        valid: false,
        reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [warningDiag(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          `Role snapshot publisher "${envelope.metadata.name}" (wallet: ${identity.address}) is not the SysOp`,
          envelope.metadata)],
      };
    }

    // 3. Payload sysopAddress must match configured SysOp wallet
    if (envelope.data.sysopAddress !== QUC_SYSOP_ADDRESS) {
      return {
        valid: false,
        reason: ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
        diagnostics: [warningDiag(ValidationReasonCodes.EMBEDDED_IDENTITY_MISMATCH,
          `Payload sysopAddress "${envelope.data.sysopAddress}" does not match configured SysOp`,
          envelope.metadata)],
      };
    }

    // 4. Identifier key must bind to snapshotId
    const parsed = parseRoleSnapshotIdentifier(envelope.metadata.identifier);
    if (!parsed) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
          'Role snapshot identifier does not parse', envelope.metadata)],
      };
    }

    if (!(await verifyRoleSnapshotKey(parsed.snapshotKey, envelope.data.snapshotId))) {
      return {
        valid: false,
        reason: ValidationReasonCodes.IDENTIFIER_INVALID,
        diagnostics: [warningDiag(ValidationReasonCodes.IDENTIFIER_INVALID,
          'Snapshot key does not bind to snapshotId', envelope.metadata)],
      };
    }

    return { valid: true };
  },
};
