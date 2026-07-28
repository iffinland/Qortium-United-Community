// ===== Moderation Historical Authorization =====
//
// Authorizes moderation operations against their exact referenced role snapshot.
// Each operation references one immutable snapshot — authorization is evaluated
// against that snapshot, NOT the current registry.
//
// This prevents:
//   - Retroactive invalidation (later revocation doesn't undo old valid ops)
//   - Retroactive authorization (later grant doesn't validate old invalid ops)

import type { QucpModerationOperation } from '../schemas/moderationOperationSchema';
import type { QucpRoleRegistrySnapshot } from '../schemas/roleRegistrySnapshotSchema';
import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import { getCapabilitiesForWallet } from '../roles/roleAuthorization';
import { getRequiredCapability } from '../roles/roleCapabilities';
import { parseRoleSnapshotIdentifier } from '../identifiers/roleSnapshotIdentifiers';

// ---- Historical Authorization Result ----

export type HistoricalAuthStatus =
  | 'authorized'
  | 'unauthorized'
  | 'snapshot-missing'
  | 'snapshot-unavailable'
  | 'snapshot-rejected'
  | 'snapshot-quarantined'
  | 'snapshot-identifier-mismatch'
  | 'snapshot-temporally-invalid'
  | 'snapshot-history-invalid'
  | 'actor-not-found'
  | 'invalid-action-target';

export interface HistoricalAuthResult {
  status: HistoricalAuthStatus;
  reason?: string;
}

// ---- Accepted Snapshot Registry ----

interface SnapshotEntry {
  envelope: QdnResourceEnvelope<QucpRoleRegistrySnapshot>;
}

/**
 * Authorize a moderation operation against its exact referenced snapshot.
 *
 * The operation must reference the exact snapshot that was current when
 * the moderation action was performed. Authorization is evaluated
 * against THAT snapshot's role state.
 */
export function authorizeModerationAtSnapshot(
  operation: QucpModerationOperation,
  acceptedSnapshots: Map<string, SnapshotEntry>,
  moderationEnvelope?: QdnResourceEnvelope<QucpModerationOperation>,
): HistoricalAuthResult {
  const { registrySnapshotId, registrySnapshotIdentifier } = operation;

  // 1. Find the referenced snapshot
  const entry = acceptedSnapshots.get(registrySnapshotId);
  if (!entry) {
    return {
      status: 'snapshot-missing',
      reason: `Referenced snapshot ${registrySnapshotId} not found in accepted snapshots`,
    };
  }

  const snapshot = entry.envelope.data;
  const snapshotIdentifier = entry.envelope.metadata.identifier;

  // 2. Verify snapshot identifier matches
  if (snapshotIdentifier !== registrySnapshotIdentifier) {
    return {
      status: 'snapshot-identifier-mismatch',
      reason: `Operation references ${registrySnapshotIdentifier} but snapshot has ${snapshotIdentifier}`,
    };
  }

  // 3. Verify snapshot identifier parses and binds to snapshotId
  const parsed = parseRoleSnapshotIdentifier(snapshotIdentifier);
  if (!parsed) {
    return {
      status: 'snapshot-identifier-mismatch',
      reason: 'Snapshot identifier does not parse',
    };
  }

  // 4. Temporal validation: snapshot must not be newer than moderation operation
  if (moderationEnvelope) {
    const snapshotTime = entry.envelope.metadata.updated ?? entry.envelope.metadata.created;
    const moderationTime = moderationEnvelope.metadata.updated ?? moderationEnvelope.metadata.created;

    if (snapshotTime !== undefined && moderationTime !== undefined && snapshotTime > moderationTime) {
      return {
        status: 'snapshot-temporally-invalid',
        reason: `Snapshot (t=${snapshotTime}) is newer than moderation operation (t=${moderationTime})`,
      };
    }
  }

  // 5. Look up actor capabilities in the referenced snapshot
  const capabilities = getCapabilitiesForWallet(operation.actorAddress, snapshot);

  // 6. Check required capability
  const requiredCap = getRequiredCapability(operation.action);
  if (!requiredCap) {
    return {
      status: 'invalid-action-target',
      reason: `Unknown action: ${operation.action}`,
    };
  }

  if (!capabilities.includes(requiredCap)) {
    return {
      status: 'unauthorized',
      reason: `Actor lacked capability "${requiredCap}" in snapshot ${registrySnapshotId}`,
    };
  }

  return { status: 'authorized' };
}

/**
 * Present-time write authorization helper.
 *
 * Checks if an actor can perform a moderation action NOW,
 * against the CURRENT accepted snapshot.
 */
export function authorizeCurrentModerationWrite(
  actorAddress: string,
  action: string,
  currentSnapshot: QucpRoleRegistrySnapshot,
): { authorized: boolean; reason?: string } {
  const requiredCap = getRequiredCapability(action);
  if (!requiredCap) {
    return { authorized: false, reason: `Unknown action: ${action}` };
  }

  const capabilities = getCapabilitiesForWallet(actorAddress, currentSnapshot);
  if (!capabilities.includes(requiredCap)) {
    return { authorized: false, reason: `Actor lacks capability "${requiredCap}"` };
  }

  return { authorized: true };
}
