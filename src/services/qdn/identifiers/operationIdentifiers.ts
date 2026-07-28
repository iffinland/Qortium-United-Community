// ===== Operation Identifiers =====
//
// Reaction:  qucp-r-{26hex-targetKey}-{26hex-actorKey}   = 60 chars
// Tombstone: qucp-ot-{26hex-targetKey}-{26hex-ownerKey}  = 61 chars
//
// Both comply with Core's verified MAX_IDENTIFIER_LENGTH = 64.

import {
  buildReactionActorKey, buildReactionTargetKey,
  buildTombstoneOwnerKey, buildTombstoneTargetKey,
  OPERATION_KEY_HEX_LENGTH,
} from './operationKeys';

// ---- Prefix Constants ----

export const REACTION_IDENTIFIER_PREFIX = 'qucp-r-';
export const OWNER_TOMBSTONE_IDENTIFIER_PREFIX = 'qucp-ot-';

// ---- Reaction ----

export async function buildReactionIdentifier(
  targetFamily: string, targetEntityId: string, actorAddress: string,
): Promise<string> {
  const tk = await buildReactionTargetKey(targetFamily, targetEntityId);
  const ak = await buildReactionActorKey(actorAddress);
  return `${REACTION_IDENTIFIER_PREFIX}${tk}-${ak}`;
}

const REACTION_RE = new RegExp(
  `^qucp-r-([a-f0-9]{${OPERATION_KEY_HEX_LENGTH}})-([a-f0-9]{${OPERATION_KEY_HEX_LENGTH}})$`,
);

export function parseReactionIdentifier(id: string): { targetKey: string; actorKey: string } | null {
  const m = id.match(REACTION_RE);
  return m ? { targetKey: m[1], actorKey: m[2] } : null;
}

// ---- Tombstone ----

export async function buildOwnerTombstoneIdentifier(
  targetFamily: string, targetEntityId: string, ownerAddress: string,
): Promise<string> {
  const tk = await buildTombstoneTargetKey(targetFamily, targetEntityId);
  const ok = await buildTombstoneOwnerKey(ownerAddress);
  return `${OWNER_TOMBSTONE_IDENTIFIER_PREFIX}${tk}-${ok}`;
}

const TOMBSTONE_RE = new RegExp(
  `^qucp-ot-([a-f0-9]{${OPERATION_KEY_HEX_LENGTH}})-([a-f0-9]{${OPERATION_KEY_HEX_LENGTH}})$`,
);

export function parseOwnerTombstoneIdentifier(id: string): { targetKey: string; ownerKey: string } | null {
  const m = id.match(TOMBSTONE_RE);
  return m ? { targetKey: m[1], ownerKey: m[2] } : null;
}
