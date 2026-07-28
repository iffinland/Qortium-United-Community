// ===== Role Authorization Helpers =====
//
// Wallet-address-based role lookup against a trusted role snapshot.
// SysOp trust anchor always receives all capabilities.
//
// Updated for append-only snapshots (QUCP-REF-005A).

import type { QucpRoleRegistrySnapshot, QucpRole } from '../schemas/roleRegistrySnapshotSchema';
import { QUC_SYSOP_ADDRESS } from '../../../config/qortiumTrust';
import { ROLE_CAPABILITIES, type QucpCapability, ALL_CAPABILITIES } from './roleCapabilities';

// ---- Role Lookup ----

export function getRolesForWallet(
  address: string,
  snapshot: QucpRoleRegistrySnapshot,
): QucpRole[] {
  if (!address) return [];

  if (address === QUC_SYSOP_ADDRESS) {
    return ['admin'];
  }

  const member = snapshot.members.find((m) => m.address === address);
  return member ? [...member.roles] : [];
}

export function hasRole(
  address: string,
  role: QucpRole,
  snapshot: QucpRoleRegistrySnapshot,
): boolean {
  return getRolesForWallet(address, snapshot).includes(role);
}

// ---- Capability Check ----

export function getCapabilitiesForWallet(
  address: string,
  snapshot: QucpRoleRegistrySnapshot,
): QucpCapability[] {
  if (!address) return [];

  if (address === QUC_SYSOP_ADDRESS) {
    return [...ALL_CAPABILITIES];
  }

  const roles = getRolesForWallet(address, snapshot);
  const caps = new Set<QucpCapability>();
  for (const role of roles) {
    for (const cap of ROLE_CAPABILITIES[role]) {
      caps.add(cap);
    }
  }
  return Array.from(caps);
}

export function hasCapability(
  address: string,
  capability: QucpCapability,
  snapshot: QucpRoleRegistrySnapshot,
): boolean {
  return getCapabilitiesForWallet(address, snapshot).includes(capability);
}
