// ===== Moderation Identifiers =====
//
// Moderation: qucp-m-{26hex-targetKey}-{26hex-operationKey} = 63 chars
//
// Multiple moderation operations may exist for the same target and actor
// over time — operation identity includes operationId, actor, and action.
// This supports append-only moderation history.

import {
  buildModerationTargetKey, buildModerationOperationKey,
  OPERATION_KEY_HEX_LENGTH,
} from './moderationKeys';

// ---- Prefix ----

export const MODERATION_IDENTIFIER_PREFIX = 'qucp-m-';

// ---- Builder ----

export async function buildModerationIdentifier(
  targetFamily: string,
  targetEntityId: string,
  operationId: string,
  actorAddress: string,
  action: string,
  registrySnapshotId: string,
): Promise<string> {
  const tk = await buildModerationTargetKey(targetFamily, targetEntityId);
  const ok = await buildModerationOperationKey(operationId, actorAddress, action, registrySnapshotId);
  return `${MODERATION_IDENTIFIER_PREFIX}${tk}-${ok}`;
}

// ---- Parser ----

const MODERATION_RE = new RegExp(
  `^qucp-m-([a-f0-9]{${OPERATION_KEY_HEX_LENGTH}})-([a-f0-9]{${OPERATION_KEY_HEX_LENGTH}})$`,
);

export function parseModerationIdentifier(id: string): { targetKey: string; operationKey: string } | null {
  const m = id.match(MODERATION_RE);
  return m ? { targetKey: m[1], operationKey: m[2] } : null;
}
