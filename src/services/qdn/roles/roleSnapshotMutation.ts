// ===== Canonical Role Snapshot Mutation Helpers =====
//
// Pure helpers for constructing the next SysOp-published role snapshot.
// The only assignable privileged role is 'admin'. Removing an admin means
// removing that member from the next snapshot, so the wallet resolves to User.
//
// SysOp is intentionally outside this mutation model: it is the trust anchor
// configured in qortiumTrust and is never written as a snapshot member role.

import { QUC_SYSOP_ADDRESS } from '../../../config/qortiumTrust';
import type {
  QucpRoleRegistrySnapshot,
  QucpRole,
} from '../schemas/roleRegistrySnapshotSchema';

export type SnapshotMember = QucpRoleRegistrySnapshot['members'][number];

const WALLET_RE = /^Q[A-Za-z0-9]{32,35}$/;

export function isValidWalletAddress(value: string): boolean {
  return WALLET_RE.test(value);
}

export function buildRoleSnapshotPayload(input: {
  snapshotId: string;
  previousSnapshotId?: string;
  members: SnapshotMember[];
  createdAt?: number;
}): QucpRoleRegistrySnapshot {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-role-snapshot',
    snapshotId: input.snapshotId,
    previousSnapshotId: input.previousSnapshotId,
    sysopAddress: QUC_SYSOP_ADDRESS,
    members: input.members,
    createdAt: input.createdAt ?? Date.now(),
  };
}

function sortMembers(members: SnapshotMember[]): SnapshotMember[] {
  return [...members].sort((a, b) => a.address.localeCompare(b.address));
}

/**
 * Return the next members set with `address` granted the admin role.
 * Existing member entries for the address are replaced, never merged with
 * obsolete roles.
 */
export function assignAdminRole(
  members: SnapshotMember[],
  address: string,
  displayName?: string,
): SnapshotMember[] {
  const without = members.filter((m) => m.address !== address);
  const entry: SnapshotMember = {
    address,
    roles: ['admin' as QucpRole],
    ...(displayName ? { displayName } : {}),
  };
  return sortMembers([...without, entry]);
}

/** Return the next members set with `address` removed entirely. */
export function removeAdminRole(
  members: SnapshotMember[],
  address: string,
): SnapshotMember[] {
  return sortMembers(members.filter((m) => m.address !== address));
}

export function listAdminAddresses(snapshot: QucpRoleRegistrySnapshot): string[] {
  return snapshot.members
    .filter((m) => m.roles.includes('admin'))
    .map((m) => m.address)
    .sort((a, b) => a.localeCompare(b));
}

export function createAdminAssignmentSnapshot(
  current: QucpRoleRegistrySnapshot | null,
  snapshotId: string,
  address: string,
  displayName?: string,
  now?: number,
): QucpRoleRegistrySnapshot {
  return buildRoleSnapshotPayload({
    snapshotId,
    previousSnapshotId: current?.snapshotId,
    members: assignAdminRole(current?.members ?? [], address, displayName),
    createdAt: now,
  });
}

export function createAdminRemovalSnapshot(
  current: QucpRoleRegistrySnapshot | null,
  snapshotId: string,
  address: string,
  now?: number,
): QucpRoleRegistrySnapshot {
  return buildRoleSnapshotPayload({
    snapshotId,
    previousSnapshotId: current?.snapshotId,
    members: removeAdminRole(current?.members ?? [], address),
    createdAt: now,
  });
}
