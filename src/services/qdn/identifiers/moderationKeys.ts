// ===== Moderation Operation Keys =====
//
// Deterministic, domain-separated, collision-resistant key derivation
// for moderation operation identifiers.
//
// Uses SHA-256 with canonical domain prefixes.
// Every operation key provides 104 bits (26 lowercase hex characters).
//
// Core constraint: ArbitraryTransaction.MAX_IDENTIFIER_LENGTH = 64
//
//   Moderation: qucp-m-{26hex-targetKey}-{26hex-operationKey} = 63 chars

import { OPERATION_KEY_HEX_LENGTH } from './operationKeys';

// Re-export for consumers
export { OPERATION_KEY_HEX_LENGTH };

const ENCODER = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const data = ENCODER.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const WALLET_RE = /^Q[A-Za-z0-9]+$/;
function checkWallet(addr: string): void {
  if (!WALLET_RE.test(addr) || addr.length < 33 || addr.length > 36) {
    throw new Error(`Invalid wallet: ${addr.slice(0, 8)}...`);
  }
}

// ---- Moderation Target Key ----

export async function buildModerationTargetKey(family: string, entityId: string): Promise<string> {
  return (await sha256Hex(`qucp:v1:moderation-target:${family}:${entityId}`)).slice(0, OPERATION_KEY_HEX_LENGTH);
}

export async function verifyModerationTargetKey(key: string, family: string, entityId: string): Promise<boolean> {
  return key.length === OPERATION_KEY_HEX_LENGTH && key === await buildModerationTargetKey(family, entityId);
}

// ---- Moderation Operation Key ----

/**
 * Build a deterministic operation key.
 *
 * Domain: qucp:v1:moderation-operation:<operationId>:<actorAddress>:<action>:<registrySnapshotId>
 *
 * The registry snapshot ID binds the authorization context to the operation.
 * An operation cannot be re-interpreted with a different snapshot.
 */
export async function buildModerationOperationKey(
  operationId: string, actorAddress: string, action: string, registrySnapshotId: string,
): Promise<string> {
  checkWallet(actorAddress);
  return (await sha256Hex(`qucp:v1:moderation-operation:${operationId}:${actorAddress}:${action}:${registrySnapshotId}`)).slice(0, OPERATION_KEY_HEX_LENGTH);
}

export async function verifyModerationOperationKey(
  key: string, operationId: string, actorAddress: string, action: string, registrySnapshotId: string,
): Promise<boolean> {
  return key.length === OPERATION_KEY_HEX_LENGTH && key === await buildModerationOperationKey(operationId, actorAddress, action, registrySnapshotId);
}
