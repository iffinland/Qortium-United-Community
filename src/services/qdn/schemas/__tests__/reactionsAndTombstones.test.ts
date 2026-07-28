// ===== Reactions & Tombstones — Compact 104-bit Identifier Tests =====
//
// QUCP-REF-004B: Compact prefixes (qucp-r-, qucp-ot-),
// uniform 26-hex (104-bit) operation keys.

import { describe, it, expect } from 'vitest';
import { reactionSchema } from '../reactionSchema';
import { ownerTombstoneSchema } from '../ownerTombstoneSchema';
import {
  buildReactionActorKey, buildReactionTargetKey,
  buildTombstoneOwnerKey,
  verifyReactionActorKey, verifyReactionTargetKey,
  verifyTombstoneOwnerKey, verifyTombstoneTargetKey,
  OPERATION_KEY_HEX_LENGTH, QDN_MAX_IDENTIFIER_LENGTH,
} from '../../identifiers/operationKeys';
import {
  buildReactionIdentifier, parseReactionIdentifier,
  buildOwnerTombstoneIdentifier, parseOwnerTombstoneIdentifier,
} from '../../identifiers/operationIdentifiers';
import { getActiveReactions, deriveReactionCounts } from '../../operations/reactionReducer';
import { authorizeOwnerTombstone } from '../../operations/ownerTombstoneReducer';
import { classifyTargetLink } from '../../operations/targetLinkage';
import { createResourceEnvelope } from '../../QdnResourceEnvelope';

const WALLET_A = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const WALLET_B = 'QN3XYzAbCdEfGhIjKlMnOpQrStUvWxYz123';

function meta(overrides?: { name?: string; identifier?: string; created?: number; updated?: number }) {
  return {
    name: overrides?.name ?? 'Alice', service: 'DOCUMENT' as const,
    identifier: overrides?.identifier ?? 'qucp-r-aaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbbbbbbbbbbbb',
    created: overrides?.created ?? 1700000000000, updated: overrides?.updated ?? 1700000001000,
  };
}

function validReaction(overrides?: Record<string, unknown>) {
  return {
    schemaVersion: 1 as const, resourceFamily: 'qucp-reaction' as const,
    operationId: 'react0001', targetFamily: 'qucp-post' as const, targetEntityId: 'post1234',
    actorName: 'Alice', actorAddress: WALLET_A,
    reactionType: 'like' as const, active: true, createdAt: 1700000000000,
    ...overrides,
  };
}

function validTombstone(overrides?: Record<string, unknown>) {
  return {
    schemaVersion: 1 as const, resourceFamily: 'qucp-owner-tombstone' as const,
    operationId: 'tomb00001', targetFamily: 'qucp-post' as const, targetEntityId: 'post1234',
    ownerName: 'Alice', ownerAddress: WALLET_A,
    action: 'delete' as const, createdAt: 1700000000000,
    ...overrides,
  };
}

// ================================================================
//  KEY GENERATION — 26 hex = 104 bits
// ================================================================

describe('key generation (104-bit)', () => {
  it('actor key length is 26', async () => {
    const key = await buildReactionActorKey(WALLET_A);
    expect(key).toHaveLength(OPERATION_KEY_HEX_LENGTH);
    expect(key).toHaveLength(26);
  });

  it('owner key length is 26', async () => {
    const key = await buildTombstoneOwnerKey(WALLET_A);
    expect(key).toHaveLength(OPERATION_KEY_HEX_LENGTH);
    expect(key).toHaveLength(26);
  });

  it('target key length is 26', async () => {
    const key = await buildReactionTargetKey('qucp-post', 'post1234');
    expect(key).toHaveLength(OPERATION_KEY_HEX_LENGTH);
    expect(key).toHaveLength(26);
  });

  it('output is lowercase hexadecimal', async () => {
    const key = await buildReactionActorKey(WALLET_A);
    expect(key).toMatch(/^[a-f0-9]{26}$/);
  });

  it('deterministic repeated generation', async () => {
    const a = await buildReactionActorKey(WALLET_A);
    const b = await buildReactionActorKey(WALLET_A);
    expect(a).toBe(b);
  });

  it('different wallets produce different keys', async () => {
    const k1 = await buildReactionActorKey(WALLET_A);
    const k2 = await buildReactionActorKey(WALLET_B);
    expect(k1).not.toBe(k2);
  });

  it('different targets produce different keys', async () => {
    const k1 = await buildReactionTargetKey('qucp-post', 'a');
    const k2 = await buildReactionTargetKey('qucp-post', 'b');
    expect(k1).not.toBe(k2);
  });
});

// ================================================================
//  DOMAIN SEPARATION
// ================================================================

describe('domain separation', () => {
  it('actor and owner keys differ for same wallet', async () => {
    const actorKey = await buildReactionActorKey(WALLET_A);
    const ownerKey = await buildTombstoneOwnerKey(WALLET_A);
    expect(actorKey).not.toBe(ownerKey);
  });

  it('different target families produce different keys', async () => {
    const k1 = await buildReactionTargetKey('qucp-post', 'x');
    const k2 = await buildReactionTargetKey('qucp-wiki', 'x');
    expect(k1).not.toBe(k2);
  });

  it('different entity IDs produce different keys', async () => {
    const k1 = await buildReactionTargetKey('qucp-post', 'a');
    const k2 = await buildReactionTargetKey('qucp-post', 'b');
    expect(k1).not.toBe(k2);
  });
});

// ================================================================
//  FULL IDENTIFIERS — length budget
// ================================================================

describe('identifier length budget', () => {
  it('reaction identifier length is 60', async () => {
    const id = await buildReactionIdentifier('qucp-post', 'post1234', WALLET_A);
    expect(id.length).toBe(60);
  });

  it('tombstone identifier length is 61', async () => {
    const id = await buildOwnerTombstoneIdentifier('qucp-post', 'post1234', WALLET_A);
    expect(id.length).toBe(61);
  });

  it('both identifiers comply with Core maximum', async () => {
    const rId = await buildReactionIdentifier('qucp-post', 'post1234', WALLET_A);
    const tId = await buildOwnerTombstoneIdentifier('qucp-post', 'post1234', WALLET_A);
    expect(rId.length).toBeLessThanOrEqual(QDN_MAX_IDENTIFIER_LENGTH);
    expect(tId.length).toBeLessThanOrEqual(QDN_MAX_IDENTIFIER_LENGTH);
  });

  it('reaction parser round-trips', async () => {
    const id = await buildReactionIdentifier('qucp-post', 'post1234', WALLET_A);
    const parsed = parseReactionIdentifier(id);
    expect(parsed).not.toBeNull();
    expect(parsed!.targetKey).toHaveLength(26);
    expect(parsed!.actorKey).toHaveLength(26);
  });

  it('tombstone parser round-trips', async () => {
    const id = await buildOwnerTombstoneIdentifier('qucp-post', 'post1234', WALLET_A);
    const parsed = parseOwnerTombstoneIdentifier(id);
    expect(parsed).not.toBeNull();
    expect(parsed!.targetKey).toHaveLength(26);
    expect(parsed!.ownerKey).toHaveLength(26);
  });
});

// ================================================================
//  LEGACY REJECTION — all old formats
// ================================================================

describe('legacy rejection', () => {
  // 16-hex (old QUCP-REF-004 format)
  it('rejects 16-hex reaction identifier', () => {
    expect(parseReactionIdentifier('qucp-reaction-0123456789abcdef-fedcba9876543210')).toBeNull();
  });

  it('rejects 16-hex tombstone identifier', () => {
    expect(parseOwnerTombstoneIdentifier('qucp-owner-tombstone-0123456789abcdef-fedcba9876543210')).toBeNull();
  });

  // 22-hex (QUCP-REF-004A reaction format)
  it('rejects 22-hex reaction identifier (REF-004A format)', () => {
    const id = 'qucp-reaction-' + 'a'.repeat(22) + '-' + 'b'.repeat(22);
    expect(parseReactionIdentifier(id)).toBeNull();
  });

  // 19-hex (QUCP-REF-004A tombstone format)
  it('rejects 19-hex tombstone identifier (REF-004A format)', () => {
    const id = 'qucp-owner-tombstone-' + 'a'.repeat(19) + '-' + 'b'.repeat(19);
    expect(parseOwnerTombstoneIdentifier(id)).toBeNull();
  });

  // Old long textual prefixes
  it('rejects old reaction prefix (qucp-reaction-)', () => {
    const id = 'qucp-reaction-' + 'a'.repeat(26) + '-' + 'b'.repeat(26);
    expect(parseReactionIdentifier(id)).toBeNull();
  });

  it('rejects old tombstone prefix (qucp-owner-tombstone-)', () => {
    const id = 'qucp-owner-tombstone-' + 'a'.repeat(26) + '-' + 'b'.repeat(26);
    expect(parseOwnerTombstoneIdentifier(id)).toBeNull();
  });

  // Wrong casing
  it('rejects uppercase hex in reaction identifier', () => {
    const id = 'qucp-r-' + 'A'.repeat(26) + '-' + 'B'.repeat(26);
    expect(parseReactionIdentifier(id)).toBeNull();
  });

  it('rejects uppercase hex in tombstone identifier', () => {
    const id = 'qucp-ot-' + 'A'.repeat(26) + '-' + 'B'.repeat(26);
    expect(parseOwnerTombstoneIdentifier(id)).toBeNull();
  });

  // Short key
  it('rejects short key (25 hex) in reaction identifier', () => {
    const id = 'qucp-r-' + 'a'.repeat(25) + '-' + 'b'.repeat(26);
    expect(parseReactionIdentifier(id)).toBeNull();
  });

  it('rejects short key (25 hex) in tombstone identifier', () => {
    const id = 'qucp-ot-' + 'a'.repeat(25) + '-' + 'b'.repeat(26);
    expect(parseOwnerTombstoneIdentifier(id)).toBeNull();
  });

  // Long key
  it('rejects long key (27 hex) in reaction identifier', () => {
    const id = 'qucp-r-' + 'a'.repeat(27) + '-' + 'b'.repeat(26);
    expect(parseReactionIdentifier(id)).toBeNull();
  });

  it('rejects long key (27 hex) in tombstone identifier', () => {
    const id = 'qucp-ot-' + 'a'.repeat(27) + '-' + 'b'.repeat(26);
    expect(parseOwnerTombstoneIdentifier(id)).toBeNull();
  });

  // Trailing suffix
  it('rejects trailing suffix on reaction identifier', () => {
    const id = 'qucp-r-' + 'a'.repeat(26) + '-' + 'b'.repeat(26) + '-extra';
    expect(parseReactionIdentifier(id)).toBeNull();
  });

  it('rejects trailing suffix on tombstone identifier', () => {
    const id = 'qucp-ot-' + 'a'.repeat(26) + '-' + 'b'.repeat(26) + '-extra';
    expect(parseOwnerTombstoneIdentifier(id)).toBeNull();
  });

  // Legacy qucp-v1- rejection
  it('rejects old qucp-v1-r- reaction prefix', () => {
    const id = 'qucp-v1-r-' + 'a'.repeat(26) + '-' + 'b'.repeat(26);
    expect(parseReactionIdentifier(id)).toBeNull();
  });

  it('rejects old qucp-v1-ot- tombstone prefix', () => {
    const id = 'qucp-v1-ot-' + 'a'.repeat(26) + '-' + 'b'.repeat(26);
    expect(parseOwnerTombstoneIdentifier(id)).toBeNull();
  });

  // Missing component
  it('rejects missing key component in reaction identifier', () => {
    expect(parseReactionIdentifier('qucp-r-' + 'a'.repeat(26))).toBeNull();
  });

  it('rejects missing key component in tombstone identifier', () => {
    expect(parseOwnerTombstoneIdentifier('qucp-ot-' + 'a'.repeat(26))).toBeNull();
  });
});

// ================================================================
//  POLICY BINDING — payload-derived validation
// ================================================================

describe('policy binding', () => {
  it('actor wallet change invalidates reaction identifier', async () => {
    const id = await buildReactionIdentifier('qucp-post', 'post1234', WALLET_A);
    const parsed = parseReactionIdentifier(id)!;
    expect(await verifyReactionActorKey(parsed.actorKey, WALLET_B)).toBe(false);
  });

  it('target entity change invalidates reaction identifier', async () => {
    const id = await buildReactionIdentifier('qucp-post', 'post1234', WALLET_A);
    const parsed = parseReactionIdentifier(id)!;
    expect(await verifyReactionTargetKey(parsed.targetKey, 'qucp-post', 'other')).toBe(false);
  });

  it('owner wallet change invalidates tombstone identifier', async () => {
    const id = await buildOwnerTombstoneIdentifier('qucp-post', 'post1234', WALLET_A);
    const parsed = parseOwnerTombstoneIdentifier(id)!;
    expect(await verifyTombstoneOwnerKey(parsed.ownerKey, WALLET_B)).toBe(false);
  });

  it('target family change invalidates tombstone identifier', async () => {
    const id = await buildOwnerTombstoneIdentifier('qucp-post', 'post1234', WALLET_A);
    const parsed = parseOwnerTombstoneIdentifier(id)!;
    expect(await verifyTombstoneTargetKey(parsed.targetKey, 'qucp-wiki', 'post1234')).toBe(false);
  });

  it('copied payload with unrelated identifier rejected', async () => {
    const idA = await buildReactionIdentifier('qucp-post', 'post1234', WALLET_A);
    const idB = await buildReactionIdentifier('qucp-post', 'post1234', WALLET_B);
    const parsedA = parseReactionIdentifier(idA)!;
    expect(await verifyReactionActorKey(parsedA.actorKey, WALLET_B)).toBe(false);
    expect(idA).not.toBe(idB);
  });
});

// ================================================================
//  SCHEMAS
// ================================================================

describe('schemas', () => {
  it('valid reaction accepted', () => {
    expect(reactionSchema.safeParse(validReaction()).success).toBe(true);
  });

  it('valid tombstone accepted', () => {
    expect(ownerTombstoneSchema.safeParse(validTombstone()).success).toBe(true);
  });

  it('reaction schema rejects unknown fields', () => {
    expect(reactionSchema.safeParse({ ...validReaction(), globalCount: 42 }).success).toBe(false);
  });

  it('tombstone schema rejects moderator claim', () => {
    expect(ownerTombstoneSchema.safeParse({ ...validTombstone(), moderatorName: 'Admin' }).success).toBe(false);
  });
});

// ================================================================
//  REDUCERS — regression coverage
// ================================================================

describe('reducers', () => {
  function rEnv(data: ReturnType<typeof validReaction>, overrides?: Parameters<typeof meta>[0]) {
    return createResourceEnvelope(meta(overrides), data);
  }

  it('wallet deduplication still works', () => {
    const r1 = rEnv(validReaction({ active: true }), { name: 'Alice', updated: 100 });
    r1.data.actorAddress = WALLET_A;
    const r2 = rEnv(validReaction({ active: false }), { name: 'AliceAlt', updated: 200 });
    r2.data.actorAddress = WALLET_A;
    expect(getActiveReactions('qucp-post', 'post1234', [r1, r2])).toHaveLength(0);
  });

  it('active:false removes effective reaction', () => {
    const r1 = rEnv(validReaction({ active: true }), { name: 'Alice', updated: 100 });
    r1.data.actorAddress = WALLET_A;
    const r2 = rEnv(validReaction({ active: false }), { name: 'Alice', updated: 200 });
    r2.data.actorAddress = WALLET_A;
    expect(getActiveReactions('qucp-post', 'post1234', [r1, r2])).toHaveLength(0);
  });

  it('distinct wallets count independently', () => {
    const r1 = rEnv(validReaction({ active: true }));
    r1.data.actorAddress = WALLET_A;
    const r2 = rEnv(validReaction({ active: true }));
    r2.data.actorAddress = WALLET_B;
    expect(getActiveReactions('qucp-post', 'post1234', [r1, r2])).toHaveLength(2);
  });

  it('deriveReactionCounts correct', () => {
    const r1 = rEnv(validReaction({ active: true })); r1.data.actorAddress = WALLET_A;
    const r2 = rEnv(validReaction({ active: true })); r2.data.actorAddress = WALLET_B;
    expect(deriveReactionCounts('qucp-post', 'post1234', [r1, r2]).total).toBe(2);
  });

  it('tombstone owner authorization still works', () => {
    expect(authorizeOwnerTombstone(validTombstone(), {
      ownerName: 'Alice', ownerAddress: WALLET_A, entityId: 'post1234', resourceFamily: 'qucp-post',
    }).status).toBe('authorized');
  });

  it('foreign tombstone still rejected', () => {
    expect(authorizeOwnerTombstone(
      validTombstone({ ownerAddress: WALLET_B }),
      { ownerName: 'Alice', ownerAddress: WALLET_A, entityId: 'post1234', resourceFamily: 'qucp-post' },
    ).status).toBe('owner-mismatch');
  });
});

// ================================================================
//  TARGET LINKAGE
// ================================================================

describe('targetLinkage', () => {
  it('unchanged', () => {
    expect(classifyTargetLink('qucp-post', 'post1234', [
      { entityId: 'post1234', resourceFamily: 'qucp-post', status: 'accepted' },
    ]).status).toBe('linked');
  });
});
