// ===== Support Category Authorization =====
//
// Validates that a publisher wallet has Admin or SysOp authority
// to manage support categories.
//
// Uses the canonical QDN role snapshot system:
//   - SysOp trust anchor (QUC_SYSOP_ADDRESS) always has full authority
//   - 'admin' role in the latest accepted role snapshot grants authority
//
// The 'support' role does NOT grant category management authority per
// owner requirements — only Admin and SysOp manage categories.

import { QUC_SYSOP_ADDRESS } from '../../../config/qortiumTrust';
import type { QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';
import { hasRole } from './roleAuthorization';

// ---- Result Types ----

export type CategoryAuthResult =
  | { authorized: true; source: 'sysop-trust-anchor' | 'admin-role' }
  | { authorized: false; reason: CategoryAuthRejection; detail?: string };

export type CategoryAuthRejection =
  | 'not-admin-nor-sysop'
  | 'role-snapshot-unavailable'
  | 'role-snapshot-invalid'
  | 'empty-wallet';

// ---- Authorization Check ----

/**
 * Determine whether a wallet address is authorized to manage support categories.
 *
 * Authorized:
 *   - SysOp trust anchor (QUC_SYSOP_ADDRESS)
 *   - Wallet with 'admin' role in the provided trusted role snapshot
 *
 * Not authorized:
 *   - 'support' role (does not grant category management)
 *   - 'moderator' role
 *   - Unknown/unlisted wallet
 *   - Empty wallet
 */
export function assertSupportCategoryManagerAuthority(
  walletAddress: string,
  roleSnapshot: QucpRoleRegistrySnapshot | null,
): CategoryAuthResult {
  if (!walletAddress) {
    return { authorized: false, reason: 'empty-wallet' };
  }

  // SysOp trust anchor always has full authority
  if (walletAddress === QUC_SYSOP_ADDRESS) {
    return { authorized: true, source: 'sysop-trust-anchor' };
  }

  // Without a trusted role snapshot, we cannot verify non-SysOp roles
  if (!roleSnapshot) {
    return {
      authorized: false,
      reason: 'role-snapshot-unavailable',
      detail: 'No trusted role snapshot available to verify admin role',
    };
  }

  // Check for admin role in the snapshot
  if (hasRole(walletAddress, 'admin', roleSnapshot)) {
    return { authorized: true, source: 'admin-role' };
  }

  return {
    authorized: false,
    reason: 'not-admin-nor-sysop',
    detail: 'Wallet does not hold admin role and is not the SysOp trust anchor',
  };
}
