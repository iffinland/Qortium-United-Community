// ===== Role Snapshot Identifiers =====
//
// Append-only immutable role snapshots: qucp-rs-{26hex-snapshotKey}
//
// Each snapshot has its own deterministic QDN identifier.
// Replaces the single mutable qucp-roles identifier from REF-005.

import { OPERATION_KEY_HEX_LENGTH } from './operationKeys';
import { QUC_SYSOP_ADDRESS } from '../../../config/qortiumTrust';

const ENCODER = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const data = ENCODER.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- Prefix ----

export const ROLE_SNAPSHOT_PREFIX = 'qucp-rs-';

// ---- Snapshot Key ----

/**
 * Build a deterministic snapshot key from the SysOp address and snapshot ID.
 *
 * Domain: qucp:v1:role-snapshot:<sysopAddress>:<snapshotId>
 *
 * Binds: resource family, configured SysOp wallet, immutable snapshot ID.
 */
export async function buildRoleSnapshotKey(snapshotId: string): Promise<string> {
  return (await sha256Hex(`qucp:v1:role-snapshot:${QUC_SYSOP_ADDRESS}:${snapshotId}`))
    .slice(0, OPERATION_KEY_HEX_LENGTH);
}

export async function verifyRoleSnapshotKey(key: string, snapshotId: string): Promise<boolean> {
  return key.length === OPERATION_KEY_HEX_LENGTH && key === await buildRoleSnapshotKey(snapshotId);
}

// ---- Identifier Builder ----

export async function buildRoleSnapshotIdentifier(snapshotId: string): Promise<string> {
  const sk = await buildRoleSnapshotKey(snapshotId);
  return `${ROLE_SNAPSHOT_PREFIX}${sk}`;
}

// ---- Identifier Parser ----

const SNAPSHOT_RE = new RegExp(
  `^qucp-rs-([a-f0-9]{${OPERATION_KEY_HEX_LENGTH}})$`,
);

export function parseRoleSnapshotIdentifier(id: string): { snapshotKey: string } | null {
  const m = id.match(SNAPSHOT_RE);
  return m ? { snapshotKey: m[1] } : null;
}

/**
 * Validate that an identifier is a valid role snapshot identifier.
 * Rejects old qucp-roles and any other format.
 */
export function validateRoleSnapshotIdentifier(identifier: string): boolean {
  return parseRoleSnapshotIdentifier(identifier) !== null;
}

// ---- Search Prefix ----

/**
 * Build a search prefix for discovering all role snapshot publications.
 */
export function buildRoleSnapshotSearchPrefix(): string {
  return ROLE_SNAPSHOT_PREFIX;
}

// ---- Length Verification ----

/** Total identifier length: prefix(11) + 26 = 37. Well under 64-char limit. */
export const ROLE_SNAPSHOT_IDENTIFIER_LENGTH = ROLE_SNAPSHOT_PREFIX.length + OPERATION_KEY_HEX_LENGTH;
