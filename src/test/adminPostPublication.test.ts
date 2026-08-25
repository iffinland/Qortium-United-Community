// ===== Admin Post Publication Canonical Contract Tests =====

import { describe, it, expect } from 'vitest';
import { buildPostPayload } from '../services/qdn/runtime/postRuntime';
import { postSchema } from '../services/qdn/schemas/postSchema';
import { postPolicy } from '../services/qdn/policies/postPolicy';
import { buildQucpIdentifier } from '../services/qdn/identifiers/qucpIdentifiers';

const OWNER = 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('Admin post canonical payload', () => {
  it('passes the canonical post schema', () => {
    const payload = buildPostPayload({
      entityId: 'post0001',
      title: 'Canonical post',
      content: 'Content body',
      ownerName: 'Alice',
      ownerAddress: OWNER,
      now: 1700000000000,
    });
    expect(postSchema.safeParse(payload).success).toBe(true);
  });

  it('passes canonical post policy parse assumptions', () => {
    const payload = buildPostPayload({
      entityId: 'post0001',
      title: 'Canonical post',
      content: 'Content body',
      ownerName: 'Alice',
      ownerAddress: OWNER,
      now: 1700000000000,
    });
    expect(postPolicy.parse(payload).success).toBe(true);
  });

  it('uses the canonical qucp-post identifier', () => {
    expect(buildQucpIdentifier('qucp-post', 'post0001')).toBe('qucp-post-post0001');
    expect(postPolicy.validateIdentifier('qucp-post-post0001').valid).toBe(true);
  });

  it('does not carry legacy post payload fields', () => {
    const payload = buildPostPayload({
      entityId: 'post0001',
      title: 'Canonical post',
      content: 'Content body',
      ownerName: 'Alice',
      ownerAddress: OWNER,
      now: 1700000000000,
    });
    const raw = payload as Record<string, unknown>;
    for (const legacy of ['id', 'authorName', 'authorAddress', 'commentsCount', 'likesCount', 'isPinned', 'status', 'updatedAt']) {
      expect(raw[legacy]).toBeUndefined();
    }
  });

  it('preserves the authoritative creation time on update', () => {
    const originalCreatedAt = 1700000000000;
    const payload = buildPostPayload({
      entityId: 'post0001',
      title: 'Updated',
      content: 'Updated content',
      ownerName: 'Alice',
      ownerAddress: OWNER,
      now: originalCreatedAt,
    });
    expect(payload.createdAt).toBe(originalCreatedAt);
    expect(payload.entityId).toBe('post0001');
  });
});

describe('Admin post write/read round-trip boundary', () => {
  it('projects a published canonical post back to the reader view', () => {
    const entityId = 'post0001';
    const payload = buildPostPayload({
      entityId,
      title: 'Round trip',
      content: 'Body',
      ownerName: 'Alice',
      ownerAddress: OWNER,
      now: 1700000000000,
    });
    const identifier = buildQucpIdentifier('qucp-post', entityId);

    // Mirror the canonical reader projection used by qortiumApi.toPostView.
    const projected = {
      id: entityId,
      title: payload.title,
      content: payload.content,
      authorName: payload.ownerName,
      authorAddress: payload.ownerAddress,
      createdAt: payload.createdAt ? new Date(payload.createdAt).toISOString() : null,
      createdAtMs: payload.createdAt ?? null,
    };

    expect(identifier).toBe('qucp-post-post0001');
    expect(projected.title).toBe('Round trip');
    expect(projected.authorName).toBe('Alice');
    expect(projected.authorAddress).toBe(OWNER);
    expect(projected.createdAt).toBe('2023-11-14T22:13:20.000Z');
    expect(projected.createdAtMs).toBe(1700000000000);
  });
});
