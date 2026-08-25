// ===== Centralized Application Role Authorization =====
//
// The production authorization model contains exactly three roles:
//
//   SysOp — trust anchor (QUC_SYSOP_ADDRESS), highest authority
//   Admin — wallet with the 'admin' role in a canonical role snapshot
//   User  — safe default / non-privileged state
//
// No other role value may grant privileges. Legacy role data (quc-roles,
// SuperAdmin, Creator, Moderator, Member) is intentionally ignored.

import type { UserRole } from '../../types';
import { QUC_SYSOP_ADDRESS } from '../../config/qortiumTrust';
import type { QucpRoleRegistrySnapshot } from '../qdn/schemas/roleRegistrySnapshotSchema';
import {
  fetchValidatedRoleSnapshots,
  getCachedRoleSnapshot,
} from '../qdn/runtime/qdnRuntimeService';

/**
 * Resolve the production role for a wallet address against a trusted,
 * validated canonical role snapshot.
 *
 * Rules:
 *   - Empty address → User
 *   - SysOp trust anchor → SysOp
 *   - 'admin' role in snapshot → Admin
 *   - everything else (including moderator/support/unknown) → User
 */
export function resolveUserRole(
  address: string,
  snapshot: QucpRoleRegistrySnapshot | null,
): UserRole {
  if (!address) return 'User';
  if (address === QUC_SYSOP_ADDRESS) return 'SysOp';
  if (!snapshot) return 'User';

  const member = snapshot.members.find((m) => m.address === address);
  if (member && member.roles.includes('admin')) return 'Admin';

  return 'User';
}

/** True only for the SysOp role. */
export function isSysOp(role: UserRole): boolean {
  return role === 'SysOp';
}

/** True for SysOp and Admin. SysOp inherits all normal Admin operations. */
export function isAdmin(role: UserRole): boolean {
  return role === 'SysOp' || role === 'Admin';
}

/** True only for SysOp. Admin cannot add/remove admins or alter SysOp authority. */
export function canManageAdmins(role: UserRole): boolean {
  return role === 'SysOp';
}

/** The set of roles that may enter administration surfaces. */
export const ADMIN_ROLES: readonly UserRole[] = ['SysOp', 'Admin'];

/**
 * Discover and resolve the current user's production role from the canonical
 * validated role-snapshot runtime. Fails closed to `User` on any error or when
 * no trusted snapshot is available.
 */
export async function fetchAuthoritativeUserRole(address: string): Promise<UserRole> {
  if (!address) return 'User';
  try {
    await fetchValidatedRoleSnapshots();
    return resolveUserRole(address, getCachedRoleSnapshot());
  } catch {
    return 'User';
  }
}
