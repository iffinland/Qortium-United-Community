// ===== Role Security Tests =====
//
// Production-path authorization proof: legacy role data must never elevate a
// user, and only a trusted canonical role snapshot can assign the Admin role.

import { describe, it, expect } from 'vitest';
import {
  resolveUserRole,
  isSysOp,
  isAdmin,
  canManageAdmins,
} from '../services/auth/authorization';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import type { QucpRoleRegistrySnapshot } from '../services/qdn/schemas/roleRegistrySnapshotSchema';

const ADMIN = 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MODERATOR = 'QBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SUPPORT = 'QCcccccccccccccccccccccccccccccccc';
const OTHER = 'QDdddddddddddddddddddddddddddddddd';

function snapshot(
  members: QucpRoleRegistrySnapshot['members'],
): QucpRoleRegistrySnapshot {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-role-snapshot',
    snapshotId: 'snap-001',
    sysopAddress: QUC_SYSOP_ADDRESS,
    members,
    createdAt: 1700000000000,
  };
}

describe('resolveUserRole', () => {
  it('returns User for empty address', () => {
    expect(resolveUserRole('', null)).toBe('User');
  });

  it('returns User when no valid canonical role snapshot exists', () => {
    expect(resolveUserRole(ADMIN, null)).toBe('User');
  });

  it('returns SysOp for the trust anchor even without a snapshot', () => {
    expect(resolveUserRole(QUC_SYSOP_ADDRESS, null)).toBe('SysOp');
  });

  it('returns Admin for a validated admin role assignment', () => {
    expect(resolveUserRole(ADMIN, snapshot([{ address: ADMIN, roles: ['admin'] }]))).toBe('Admin');
  });

  it('returns SysOp for the trust anchor even when snapshot does not list it', () => {
    expect(resolveUserRole(QUC_SYSOP_ADDRESS, snapshot([{ address: ADMIN, roles: ['admin'] }]))).toBe('SysOp');
  });

  it('does not elevate a moderator role', () => {
    expect(resolveUserRole(MODERATOR, snapshot([{ address: MODERATOR, roles: ['moderator'] }]))).toBe('User');
  });

  it('does not elevate a support role', () => {
    expect(resolveUserRole(SUPPORT, snapshot([{ address: SUPPORT, roles: ['support'] }]))).toBe('User');
  });

  it('does not elevate an unknown/legacy role value', () => {
    const legacy = snapshot([
      { address: ADMIN, roles: ['superadmin'] },
    ] as unknown as QucpRoleRegistrySnapshot['members']);
    expect(resolveUserRole(ADMIN, legacy)).toBe('User');
  });

  it('does not apply a snapshot assignment intended for another user', () => {
    expect(resolveUserRole(OTHER, snapshot([{ address: ADMIN, roles: ['admin'] }]))).toBe('User');
  });
});

describe('authorization helpers', () => {
  it('isSysOp is true only for SysOp', () => {
    expect(isSysOp('SysOp')).toBe(true);
    expect(isSysOp('Admin')).toBe(false);
    expect(isSysOp('User')).toBe(false);
  });

  it('isAdmin is true for SysOp and Admin only', () => {
    expect(isAdmin('SysOp')).toBe(true);
    expect(isAdmin('Admin')).toBe(true);
    expect(isAdmin('User')).toBe(false);
  });

  it('canManageAdmins is true only for SysOp', () => {
    expect(canManageAdmins('SysOp')).toBe(true);
    expect(canManageAdmins('Admin')).toBe(false);
    expect(canManageAdmins('User')).toBe(false);
  });
});
