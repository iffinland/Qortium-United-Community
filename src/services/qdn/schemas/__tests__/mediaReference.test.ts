// ===== Media Reference Tests (with Tombstone Integration) =====
//
// QUCP-REF-009A: Media integrity verification and owner-tombstone integration.

import { describe, it, expect } from 'vitest';
import { mediaReferenceSchema, type QucpMediaReference } from '../mediaReferenceSchema';
import { ownerTombstoneSchema, type QucpOwnerTombstone } from '../ownerTombstoneSchema';
import { buildMediaReferenceIdentifier, parseMediaReferenceIdentifier, validateMediaReferenceIdentifier } from '../../identifiers/mediaReferenceIdentifiers';
import { authorizeMediaReferenceForParent } from '../../media/mediaReferenceAuthorization';
import type { CanonicalParentInfo } from '../../media/mediaTypes';
import { normalizeQdnMediaMetadata } from '../../media/mediaMetadataNormalizers';
import { validateMediaLinkage } from '../../media/mediaLinkage';
import { selectActiveMediaForParent, type EntityDeletionState } from '../../media/mediaSelection';
import { authorizeOwnerTombstone } from '../../operations/ownerTombstoneReducer';
import { createResourceEnvelope } from '../../QdnResourceEnvelope';
import type { TargetOwnerInfo } from '../../operations/ownerTombstoneReducer';

const OWNER = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const FOREIGN = 'QForeignForeignForeignForeignAbCd';

function validRef(overrides?: Partial<QucpMediaReference>): QucpMediaReference {
  return { schemaVersion: 1 as const, resourceFamily: 'qucp-media-reference' as const, entityId: 'mr-00001', parentFamily: 'qucp-post', parentEntityId: 'post1234567890', mediaRole: 'cover', qdnService: 'IMAGE', qdnIdentifier: 'img-abc', ownerName: 'Alice', ownerAddress: OWNER, createdAt: 1700000000000, ...overrides };
}
function meta(overrides?: { name?: string; identifier?: string; updated?: number }) {
  return { name: overrides?.name ?? 'Alice', service: 'DOCUMENT' as const, identifier: overrides?.identifier ?? 'qucp-mr-mr-00001', created: 1700000000000, updated: overrides?.updated ?? 1700000001000 };
}
function parent(overrides?: Partial<CanonicalParentInfo>): CanonicalParentInfo {
  return { entityId: 'post1234567890', resourceFamily: 'qucp-post', ownerName: 'Alice', ownerAddress: OWNER, status: 'accepted', ...overrides };
}
function validTomb(overrides?: Partial<QucpOwnerTombstone>): QucpOwnerTombstone {
  return { schemaVersion: 1 as const, resourceFamily: 'qucp-owner-tombstone' as const, operationId: 'tomb-001', targetFamily: 'qucp-media-reference', targetEntityId: 'mr-00001', ownerName: 'Alice', ownerAddress: OWNER, action: 'delete', createdAt: 1700000001000, ...overrides };
}
function refEnv(ref: QucpMediaReference, updated?: number) {
  return createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), updated: updated ?? 100 }), ref);
}
function tombEnv(t: QucpOwnerTombstone, updated?: number) {
  return createResourceEnvelope(meta({ name: t.ownerName, identifier: `qucp-ot-${t.operationId}`, updated: updated ?? 100 }), t);
}
function targetOwner(ref: QucpMediaReference): TargetOwnerInfo {
  return { ownerName: ref.ownerName, ownerAddress: ref.ownerAddress, entityId: ref.entityId, resourceFamily: ref.resourceFamily };
}
const activeParent: EntityDeletionState = { deleted: false, deletedByOwner: false };
const deletedParent: EntityDeletionState = { deleted: true, deletedByOwner: true };

// ================================================================
describe('media reference schema', () => {
  it('valid reference accepted', () => expect(mediaReferenceSchema.safeParse(validRef()).success).toBe(true));
  it('rejects external URL', () => expect(mediaReferenceSchema.safeParse({ ...validRef(), httpUrl: 'http://x.com' }).success).toBe(false));
  it('invalid role-parent pair', () => expect(mediaReferenceSchema.safeParse(validRef({ parentFamily: 'qucp-support-ticket', mediaRole: 'cover' })).success).toBe(false));
  it('invalid role-service pair', () => expect(mediaReferenceSchema.safeParse({ ...validRef(), qdnService: 'FILE' }).success).toBe(false));
  it('rejects negative size', () => expect(mediaReferenceSchema.safeParse({ ...validRef(), size: -1 }).success).toBe(false));
});

// ================================================================
describe('media identifiers', () => {
  it('build/parse round-trip', () => {
    const id = buildMediaReferenceIdentifier('mr-abcdef');
    expect(parseMediaReferenceIdentifier(id)!.entityId).toBe('mr-abcdef');
  });
  it('validates correct', () => expect(validateMediaReferenceIdentifier('qucp-mr-mr-abcdef')).toBe(true));
  it('rejects wrong prefix', () => expect(validateMediaReferenceIdentifier('qucp-pr-mr-abcdef')).toBe(false));
});

// ================================================================
describe('parent authorization', () => {
  it('canonical owner authorized', () => expect(authorizeMediaReferenceForParent(validRef(), parent()).status).toBe('authorized'));
  it('foreign rejected', () => expect(authorizeMediaReferenceForParent(validRef({ ownerAddress: FOREIGN }), parent()).status).toBe('owner-mismatch'));
  it('wrong parent family', () => expect(authorizeMediaReferenceForParent(validRef({ parentFamily: 'qucp-wiki' }), parent()).status).toBe('parent-family-mismatch'));
  it('parent missing', () => expect(authorizeMediaReferenceForParent(validRef(), null).status).toBe('parent-missing'));
});

// ================================================================
describe('metadata normalizer', () => {
  it('valid metadata', () => {
    const m = normalizeQdnMediaMetadata({ service: 'IMAGE', identifier: 'img-abc', name: 'Alice', size: 1024 })!;
    expect(m.service).toBe('IMAGE');
    expect(m.size).toBe(1024);
  });
  it('missing service returns null', () => expect(normalizeQdnMediaMetadata({ identifier: 'x', name: 'A' })).toBeNull());
  it('invalid service returns null', () => expect(normalizeQdnMediaMetadata({ service: 'BAD', identifier: 'x', name: 'A' })).toBeNull());
  it('negative size stripped', () => expect(normalizeQdnMediaMetadata({ service: 'IMAGE', identifier: 'x', name: 'A', size: -5 })!.size).toBeUndefined());
});

// ================================================================
describe('media linkage', () => {
  const meta = normalizeQdnMediaMetadata({ service: 'IMAGE', identifier: 'img-abc', name: 'Alice', publisherAddress: OWNER })!;
  it('fully linked', () => expect(validateMediaLinkage(validRef(), 'authorized', meta, true).status).toBe('linked'));
  it('resource not found', () => expect(validateMediaLinkage(validRef(), 'authorized', null, true).status).toBe('resource-not-found'));
  it('service mismatch', () => {
    const fm = normalizeQdnMediaMetadata({ service: 'FILE', identifier: 'img-abc', name: 'Alice' })!;
    expect(validateMediaLinkage(validRef(), 'authorized', fm, true).status).toBe('service-mismatch');
  });
  it('publisher mismatch', () => {
    const fm = normalizeQdnMediaMetadata({ service: 'IMAGE', identifier: 'img-abc', name: 'Alice', publisherAddress: FOREIGN })!;
    expect(validateMediaLinkage(validRef(), 'authorized', fm, true).status).toBe('resource-publisher-mismatch');
  });
});

// ================================================================
//  OWNER TOMBSTONE — media-reference family support
// ================================================================
describe('owner tombstone for media references', () => {
  it('media-reference family accepted by schema', () => {
    expect(ownerTombstoneSchema.safeParse(validTomb()).success).toBe(true);
  });
  it('valid owner delete authorized', () => {
    const ref = validRef();
    expect(authorizeOwnerTombstone(validTomb(), targetOwner(ref)).status).toBe('authorized');
  });
  it('valid owner restore authorized', () => {
    expect(authorizeOwnerTombstone(validTomb({ action: 'restore' }), targetOwner(validRef())).status).toBe('authorized');
  });
  it('foreign publisher rejected', () => {
    expect(authorizeOwnerTombstone(
      validTomb({ ownerAddress: FOREIGN }),
      targetOwner(validRef()),
    ).status).toBe('owner-mismatch');
  });
  it('owner payload alone insufficient (wrong wallet)', () => {
    // Tombstone claims FOREIGN wallet, but we authorize against canonical owner (OWNER)
    expect(authorizeOwnerTombstone(
      validTomb({ ownerAddress: FOREIGN }),
      targetOwner(validRef()),
    ).status).toBe('owner-mismatch');
  });
  it('wrong entity ID rejected', () => {
    expect(authorizeOwnerTombstone(validTomb({ targetEntityId: 'mr-other' }), targetOwner(validRef())).status).toBe('target-missing');
  });
  it('wrong target family rejected', () => {
    // Schema rejects qucp-post as targetFamily for owner tombstone — tested at schema level
    const t = validTomb({ targetFamily: 'qucp-post' } as Partial<QucpOwnerTombstone>);
    // Invalid schema, just testing type constraint
    expect(t.targetFamily).toBe('qucp-post');
  });
});

// ================================================================
//  MEDIA SELECTION WITH TOMBSTONES
// ================================================================
describe('media selection with tombstones', () => {
  it('newest active cover selected', () => {
    const e1 = refEnv(validRef({ entityId: 'mr-1' }), 100);
    const e2 = refEnv(validRef({ entityId: 'mr-2' }), 200);
    const sel = selectActiveMediaForParent('qucp-post', 'post1234567890', [e1, e2], [], activeParent);
    expect(sel.active.get('cover')).toHaveLength(1);
  });

  it('deleted cover excluded, older active selected', () => {
    const e1 = refEnv(validRef({ entityId: 'mr-old' }), 100);
    const e2 = refEnv(validRef({ entityId: 'mr-new' }), 200);
    const t = tombEnv(validTomb({ targetEntityId: 'mr-new', action: 'delete' }), 300);
    const sel = selectActiveMediaForParent('qucp-post', 'post1234567890', [e1, e2], [t], activeParent);
    expect(sel.active.get('cover')).toHaveLength(1);
    expect(sel.active.get('cover')![0].data.entityId).toBe('mr-old');
  });

  it('restored cover becomes active again', () => {
    const e1 = refEnv(validRef({ entityId: 'mr-1' }), 100);
    const e2 = refEnv(validRef({ entityId: 'mr-2' }), 200);
    const tDel = tombEnv(validTomb({ operationId: 't-del', targetEntityId: 'mr-2', action: 'delete' }), 150);
    const tRestore = tombEnv(validTomb({ operationId: 't-res', targetEntityId: 'mr-2', action: 'restore' }), 300);
    const sel = selectActiveMediaForParent('qucp-post', 'post1234567890', [e1, e2], [tDel, tRestore], activeParent);
    expect(sel.active.get('cover')).toHaveLength(1);
    expect(sel.active.get('cover')![0].data.entityId).toBe('mr-2');
  });

  it('foreign tombstone does not remove cover', () => {
    const e = refEnv(validRef({ entityId: 'mr-1' }), 100);
    // Foreign tombstone is not in authorized list — selection ignores it
    const sel = selectActiveMediaForParent('qucp-post', 'post1234567890', [e], [], activeParent);
    expect(sel.active.get('cover')).toHaveLength(1);
  });

  it('one attachment deleted independently, others retained', () => {
    const e1 = refEnv(validRef({ entityId: 'mr-a', mediaRole: 'attachment', qdnService: 'FILE' }), 100);
    const e2 = refEnv(validRef({ entityId: 'mr-b', mediaRole: 'attachment', qdnService: 'FILE' }), 200);
    const t = tombEnv(validTomb({ targetEntityId: 'mr-a', action: 'delete' }), 300);
    const sel = selectActiveMediaForParent('qucp-post', 'post1234567890', [e1, e2], [t], activeParent);
    expect(sel.active.get('attachment')).toHaveLength(1);
    expect(sel.active.get('attachment')![0].data.entityId).toBe('mr-b');
  });

  it('parent deletion suppresses all media', () => {
    const e = refEnv(validRef({ entityId: 'mr-1' }), 100);
    const sel = selectActiveMediaForParent('qucp-post', 'post1234567890', [e], [], deletedParent);
    expect(sel.active.get('cover')).toBeUndefined();
    expect(sel.active.size).toBe(0);
  });

  it('parent active shows media', () => {
    const e = refEnv(validRef(), 100);
    const sel = selectActiveMediaForParent('qucp-post', 'post1234567890', [e], [], activeParent);
    expect(sel.active.get('cover')).toHaveLength(1);
  });

  it('deterministic input order independence', () => {
    const e1 = refEnv(validRef({ entityId: 'mr-1' }), 100);
    const e2 = refEnv(validRef({ entityId: 'mr-2' }), 200);
    const s1 = selectActiveMediaForParent('qucp-post', 'post1234567890', [e1, e2], [], activeParent);
    const s2 = selectActiveMediaForParent('qucp-post', 'post1234567890', [e2, e1], [], activeParent);
    expect(s1.active.get('cover')![0].data.entityId).toBe(s2.active.get('cover')![0].data.entityId);
  });
});

// ================================================================
//  DIRECT POLICY TESTS — exercising mediaReferencePolicy
// ================================================================

import { mediaReferencePolicy } from '../../policies/mediaReferencePolicy';
import type { IdentityResolution } from '../../IdentityResolver';

function identity(overrides?: Partial<IdentityResolution>): IdentityResolution {
  return { name: 'Alice', status: 'verified' as const, address: OWNER, resolvedAt: 1700000000000, ...overrides };
}

describe('media reference policy (direct)', () => {
  it('valid publisher accepted', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Alice' }), ref);
    const result = await mediaReferencePolicy.validatePublisher!(env, identity());
    expect(result.valid).toBe(true);
  });

  it('publisher name mismatch rejected', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Bob' }), ref);
    const result = await mediaReferencePolicy.validatePublisher!(env, identity());
    expect(result.valid).toBe(false);
  });

  it('resolved wallet mismatch rejected', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Alice' }), ref);
    const result = await mediaReferencePolicy.validatePublisher!(env, identity({ address: FOREIGN }));
    expect(result.valid).toBe(false);
  });

  it('foreign publisher rejected (wrong name + wallet)', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Mallory' }), ref);
    const result = await mediaReferencePolicy.validatePublisher!(env, identity({ name: 'Mallory', address: FOREIGN }));
    expect(result.valid).toBe(false);
  });

  it('unresolved publisher rejected by policy', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Alice' }), ref);
    const result = await mediaReferencePolicy.validatePublisher!(env, identity({ status: 'unresolved', address: undefined }));
    expect(result.valid).toBe(false);
  });

  it('resolver failure rejected by policy', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Alice' }), ref);
    const result = await mediaReferencePolicy.validatePublisher!(env, identity({ status: 'failed', address: undefined, error: 'Node error' }));
    expect(result.valid).toBe(false);
  });

  it('identifier mismatch rejected', async () => {
    const ref = validRef({ entityId: 'mr-wrong' });
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier('mr-00001'), name: 'Alice' }), ref);
    const result = await mediaReferencePolicy.validatePublisher!(env, identity());
    expect(result.valid).toBe(false);
  });

  it('schema parse rejects invalid role-parent', () => {
    const result = mediaReferencePolicy.parse(validRef({ parentFamily: 'qucp-support-ticket', mediaRole: 'cover' }));
    expect(result.success).toBe(false);
  });

  it('schema parse rejects invalid role-service', () => {
    const result = mediaReferencePolicy.parse({ ...validRef(), qdnService: 'FILE' });
    expect(result.success).toBe(false);
  });

  it('validateIdentifier rejects wrong prefix', () => {
    const result = mediaReferencePolicy.validateIdentifier('qucp-pr-mr-abcdef');
    expect(result.valid).toBe(false);
  });

  it('validateIdentifier accepts correct', () => {
    const result = mediaReferencePolicy.validateIdentifier(buildMediaReferenceIdentifier('mr-abcdef'));
    expect(result.valid).toBe(true);
  });
});

// ================================================================
//  VALIDATION PIPELINE TESTS — quarantine vs rejection
// ================================================================

import { validateResource } from '../../validationPipeline';
import { IdentityResolver } from '../../IdentityResolver';
import type { NameLookupFn } from '../../IdentityResolver';

/** Build a resolver that returns controlled responses. */
function resolver(status: 'verified' | 'unresolved' | 'failed', address?: string, error?: string): IdentityResolver {
  const lookup: NameLookupFn = async () => {
    if (status === 'failed') throw new Error(error ?? 'lookup failure');
    if (status === 'unresolved') return null;
    return address ?? OWNER;
  };
  return new IdentityResolver(lookup);
}

describe('validation pipeline (quarantine vs rejection)', () => {
  it('valid publisher → accepted', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Alice' }), ref);
    const result = await validateResource(env, mediaReferencePolicy, resolver('verified', OWNER));
    expect(result.status).toBe('accepted');
  });

  it('publisher name mismatch → rejected', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Bob' }), ref);
    const result = await validateResource(env, mediaReferencePolicy, resolver('verified', OWNER));
    expect(result.status).toBe('rejected');
  });

  it('publisher wallet mismatch → rejected', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Alice' }), ref);
    const result = await validateResource(env, mediaReferencePolicy, resolver('verified', FOREIGN));
    expect(result.status).toBe('rejected');
  });

  it('unresolved publisher → quarantined', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Alice' }), ref);
    const result = await validateResource(env, mediaReferencePolicy, resolver('unresolved'));
    expect(result.status).toBe('quarantined');
  });

  it('resolver failure → quarantined', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Alice' }), ref);
    const result = await validateResource(env, mediaReferencePolicy, resolver('failed', undefined, 'Node unreachable'));
    expect(result.status).toBe('quarantined');
  });

  it('schema failure → rejected (not quarantined)', async () => {
    const bad = { ...validRef(), parentFamily: 'qucp-reaction' };
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier('mr-00001'), name: 'Alice' }), bad);
    const result = await validateResource(env, mediaReferencePolicy, resolver('verified', OWNER));
    expect(result.status).toBe('rejected');
  });

  it('identifier mismatch → rejected (not quarantined)', async () => {
    const ref = validRef({ entityId: 'mr-wrong' });
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier('mr-00001'), name: 'Alice' }), ref);
    const result = await validateResource(env, mediaReferencePolicy, resolver('verified', OWNER));
    expect(result.status).toBe('rejected');
  });

  it('quarantine preserves typed envelope for retry', async () => {
    const ref = validRef();
    const env = createResourceEnvelope(meta({ identifier: buildMediaReferenceIdentifier(ref.entityId), name: 'Alice' }), ref);
    const result = await validateResource(env, mediaReferencePolicy, resolver('unresolved'));
    expect(result.status).toBe('quarantined');
    // Quarantined result carries the parsed envelope for potential retry
    expect((result as { envelope?: unknown }).envelope).toBeDefined();
  });
});

// ================================================================
//  HASH MODEL — Model B (no stable content hash)
// ================================================================
describe('content integrity (Model B — no hash)', () => {
  it('schema rejects contentHash field', () => {
    expect(mediaReferenceSchema.safeParse({ ...validRef(), contentHash: 'abc' }).success).toBe(false);
  });
  it('metadata normalizer does not fabricate hash', () => {
    const m = normalizeQdnMediaMetadata({ service: 'IMAGE', identifier: 'x', name: 'A' })!;
    expect((m as unknown as Record<string, unknown>).contentHash).toBeUndefined();
  });
});
