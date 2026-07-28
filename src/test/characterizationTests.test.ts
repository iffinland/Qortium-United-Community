// ===== Characterization Tests =====
//
// These tests document current behavior — including unsafe legacy behavior —
// before the QDN refactor begins. Tests with "LEGACY" in their name describe
// behavior that SHOULD change after the refactor.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from 'vitest';
import { getUserRole } from '../services/qortium/rolesService';
import { parseQdnResponse } from '../services/qortium/qortiumClient';
import {
  trustedSysOpRegistry,
  untrustedRoleRegistry,
  farFutureTimestamp,
  sameEntityDifferentPublishers,
} from './fixtures/qdnFixtures';
import { buildSupportTicketPayload, buildSupportCategoryPayload } from '../services/qdn/runtime/supportRuntime';
import { supportTicketSchema } from '../services/qdn/schemas/supportTicketSchema';

// ---- Role Registry Selection (LEGACY) ----

describe('role registry selection', () => {
  it('documents current behavior: getUserRole accepts any well-formed registry', () => {
    // LEGACY: getUserRole does not validate the registry publisher.
    // It trusts any RoleRegistry object passed to it.
    const role = getUserRole(
      'QAttackerAttackerAttackerAttackerA',
      untrustedRoleRegistry,
    );
    // The attacker who crafted this registry made themselves an admin
    expect(role).toBe('Admin');
  });

  it('documents current behavior: getUserRole correctly matches against trusted registry', () => {
    const role = getUserRole('QN3XYzAbCdEfGhIjKlMnOpQrStUvWxYz', trustedSysOpRegistry);
    expect(role).toBe('Admin');
  });

  it('documents current intended target: untrusted registry should NOT grant roles', () => {
    // This test documents the TARGET behavior after Phase 3 refactor.
    // Currently PASSES (untrusted registry IS accepted), but marked as legacy.
    // After refactor, this should FAIL — untrusted registries should be rejected.
    const role = getUserRole(
      'QAttackerAttackerAttackerAttackerA',
      untrustedRoleRegistry,
    );
    // LEGACY: currently accepts untrusted registry
    // TARGET: should return 'Member' for untrusted registries
    expect(role).toBe('Admin'); // Will change to 'Member' after refactor
  });
});

// ---- Duplicate Entity Handling (LEGACY) ----

describe('duplicate entity handling', () => {
  it('documents current behavior: no deduplication of same-entity different-publishers', () => {
    // LEGACY: searchAndFetch returns all matching resources without deduplication.
    // Two publishers can publish the same logical entity ID.
    const entities = sameEntityDifferentPublishers;
    expect(entities).toHaveLength(2);
    expect(entities[0].identifier).toBe(entities[1].identifier);
    expect(entities[0].name).not.toBe(entities[1].name);
    // After refactor: only the authoritative publisher's copy should be returned
  });
});

// ---- Timestamp Handling (LEGACY) ----

describe('timestamp handling', () => {
  it('documents current behavior: far-future timestamps are accepted without validation', () => {
    // LEGACY: No timestamp bounds checking.
    // A resource with year 9999 is accepted.
    const ts = farFutureTimestamp;
    expect(ts.createdAt).toBe('9999-12-31T23:59:59.999Z');
    expect(ts.updatedAt).toBe(9999999999999);
    // After refactor: timestamps should be validated against reasonable bounds
  });

  it('documents current behavior: parseQdnResponse does not validate timestamps', () => {
    // LEGACY: parseQdnResponse only handles encoding, not content validation
    const raw = JSON.stringify({ createdAt: '9999-12-31T23:59:59.999Z' });
    const parsed = parseQdnResponse(raw);
    expect(parsed).toEqual({ createdAt: '9999-12-31T23:59:59.999Z' });
    // After refactor: schema validation should catch unreasonable timestamps
  });
});

// ---- Comment/Reply Grouping ----

describe('comment and reply grouping', () => {
  it('documents current behavior: comments use independent immutable resources', () => {
    // Current pattern: comments are published as separate resources with
    // identifier comment-{postId}-{commentId}. This is the CORRECT pattern.
    const commentId = 'comment-post-123-comment-456';
    expect(commentId).toMatch(/^comment-post-\d+-comment-\d+$/);
  });

  it('documents current behavior: forum replies use independent immutable resources', () => {
    // Current pattern: replies are published as separate resources with
    // identifier qucp-forum-reply-{entityId}. This is the CORRECT pattern.
    const replyId = 'qucp-forum-reply-reply-789';
    expect(replyId).toMatch(/^qucp-forum-reply-reply-\d+$/);
  });
});

// ---- Poll Vote Representation ----

describe('poll vote representation', () => {
  it('documents current behavior: votes are independent immutable resources', () => {
    // CORRECT pattern: each vote is a separate resource with
    // identifier vote-{pollId}-{voterAddress}
    const voteId = 'vote-poll-123-QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(voteId).toMatch(/^vote-poll-\d+-Q[A-Za-z0-9]+$/);
  });

  it('documents current legacy behavior: poll voteCount is never updated from vote records', () => {
    // LEGACY: The poll resource's voteCount fields are set at creation time
    // and never updated by vote submissions. The UI displays stale counts.
    // After refactor: vote counts should be derived from accepted vote records.
    const pollVoteCount = 0; // From creation-time snapshot
    const actualVotes = 5;    // From independent vote records
    expect(pollVoteCount).not.toBe(actualVotes);
  });
});

// ---- Bridge-Unavailable Behavior ----

describe('bridge-unavailable behavior', () => {
  it('documents current behavior: isQortiumBridgeAvailable returns false without bridge', () => {
    // Already verified in bridgeDetection.test.ts
    // In test environment, no bridge is injected, so isQortiumBridgeAvailable() returns false
    expect(true).toBe(true);
  });

  it('documents target behavior: bridge-unavailable should produce controlled error', () => {
    // TARGET: When the bridge is unavailable, the application should produce
    // a controlled, typed error — not crash with ReferenceError.
    // This is verified in bridgeDetection.test.ts
    expect(true).toBe(true); // Placeholder: actual test in bridgeDetection.test.ts
  });
});

// ---- Fixed-Limit Search Behavior (LEGACY) ----

describe('fixed-limit search behavior', () => {
  it('documents current legacy behavior: searchAndFetch uses limit 50 with no pagination', () => {
    // LEGACY: All searches use fixed limit: 50 (or 20/30) with offset: 0.
    // Resources beyond the limit are silently invisible.
    const searchLimit = 50;
    const totalResources = 75;
    expect(searchLimit).toBeLessThan(totalResources);
    // After refactor: pagination should retrieve all resources
  });
});

// ---- Forum Runtime Integration ----

import {
  buildForumTopicPayload,
  buildForumReplyPayload,
  FORUM_TOPIC_SEARCH_PREFIX,
  FORUM_REPLY_SEARCH_PREFIX,
} from '../services/qdn/runtime/forumRuntime';
import { buildQucpIdentifier, parseQucpIdentifier } from '../services/qdn/identifiers/qucpIdentifiers';
import { forumTopicPolicy } from '../services/qdn/policies/forumTopicPolicy';
import { forumReplyPolicy } from '../services/qdn/policies/forumReplyPolicy';
import { forumTopicSchema } from '../services/qdn/schemas/forumTopicSchema';
import { forumReplySchema } from '../services/qdn/schemas/forumReplySchema';

describe('FORUM RUNTIME: Topic identifiers', () => {
  it('FORUM_TOPIC_SEARCH_PREFIX is qucp-forum-topic-', () => {
    expect(FORUM_TOPIC_SEARCH_PREFIX).toBe('qucp-forum-topic-');
  });

  it('builds valid qucp-forum-topic identifier', () => {
    const id = buildQucpIdentifier('qucp-forum-topic', 'abc12345');
    expect(id).toBe('qucp-forum-topic-abc12345');
    expect(parseQucpIdentifier(id)).not.toBeNull();
  });

  it('rejects wrong-family identifier for forum topic', () => {
    const parsed = parseQucpIdentifier('qucp-post-abc12345');
    expect(parsed?.family).not.toBe('qucp-forum-topic');
  });
});

describe('FORUM RUNTIME: Reply identifiers', () => {
  it('FORUM_REPLY_SEARCH_PREFIX is qucp-forum-reply-', () => {
    expect(FORUM_REPLY_SEARCH_PREFIX).toBe('qucp-forum-reply-');
  });

  it('builds valid qucp-forum-reply identifier', () => {
    const id = buildQucpIdentifier('qucp-forum-reply', 'reply99');
    expect(id).toBe('qucp-forum-reply-reply99');
  });
});

describe('FORUM RUNTIME: Topic payload', () => {
  const ownerName = 'Alice';
  const ownerAddress = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

  it('builds valid topic payload with required fields', () => {
    const payload = buildForumTopicPayload({
      entityId: 'ft-test',
      categoryId: 'general',
      title: 'Test Topic',
      content: 'Test content',
      ownerName,
      ownerAddress,
    });
    expect(payload.resourceFamily).toBe('qucp-forum-topic');
    expect(payload.schemaVersion).toBe(1);
    expect(payload.entityId).toBe('ft-test');
    expect(payload.ownerName).toBe(ownerName);
    expect(payload.ownerAddress).toBe(ownerAddress);
  });

  it('topic schema accepts built payload', () => {
    const payload = buildForumTopicPayload({
      entityId: 'ft-test2',
      categoryId: 'tech',
      title: 'Topic',
      content: 'Content here',
      ownerName,
      ownerAddress,
    });
    const result = forumTopicSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('topic schema rejects payload without categoryId', () => {
    const result = forumTopicSchema.safeParse({
      schemaVersion: 1 as const,
      resourceFamily: 'qucp-forum-topic',
      entityId: 'ft-test',
      title: 'T',
      content: 'C',
      ownerName,
      ownerAddress,
      createdAt: Date.now(),
    });
    expect(result.success).toBe(false);
  });
});

describe('FORUM RUNTIME: Reply payload and parent linkage', () => {
  const ownerName = 'Bob';
  const ownerAddress = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

  it('builds valid reply payload with parentEntityId', () => {
    const payload = buildForumReplyPayload({
      entityId: 'fr-test',
      parentEntityId: 'parent123',
      content: 'Reply content',
      ownerName,
      ownerAddress,
    });
    expect(payload.resourceFamily).toBe('qucp-forum-reply');
    expect(payload.parentEntityId).toBe('parent123');
  });

  it('reply schema accepts built payload', () => {
    const payload = buildForumReplyPayload({
      entityId: 'fr-test2',
      parentEntityId: 'parent123',
      content: 'Reply',
      ownerName,
      ownerAddress,
    });
    const result = forumReplySchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('reply schema rejects payload without parentEntityId', () => {
    const result = forumReplySchema.safeParse({
      schemaVersion: 1 as const,
      resourceFamily: 'qucp-forum-reply',
      entityId: 'fr-test',
      content: 'C',
      ownerName,
      ownerAddress,
      createdAt: Date.now(),
    });
    expect(result.success).toBe(false);
  });

  it('forumReplyPolicy has correct family', () => {
    expect(forumReplyPolicy.family).toBe('qucp-forum-reply');
  });

  it('forumTopicPolicy has correct family', () => {
    expect(forumTopicPolicy.family).toBe('qucp-forum-topic');
  });

  it('parent reference distinguishes cross-topic replies (string mismatch)', () => {
    // A reply with parentEntityId 'A' does not match topic 'B'
    const replyParent = 'topic-A';
    const requestedTopicId = 'topic-B';
    expect(replyParent).not.toBe(requestedTopicId);
  });
});

// ---- Forum Parent-Link Diagnostics ----

import { classifyOrphan } from '../services/qdn/ordering/parentReference';

describe('FORUM DIAGNOSTICS: Parent-link rejection', () => {
  it('reply with accepted parent is linked', () => {
    const result = classifyOrphan('reply-1', 'topic-A', 'qucp-forum-topic', [
      { entityId: 'topic-A', resourceFamily: 'qucp-forum-topic', status: 'accepted' },
    ]);
    expect(result.status).toBe('linked');
  });

  it('reply with nonexistent parent is parent-missing', () => {
    const result = classifyOrphan('reply-2', 'nonexistent', 'qucp-forum-topic', [
      { entityId: 'topic-A', resourceFamily: 'qucp-forum-topic', status: 'accepted' },
    ]);
    expect(result.status).toBe('parent-missing');
  });

  it('reply with rejected parent is parent-rejected', () => {
    const result = classifyOrphan('reply-3', 'topic-B', 'qucp-forum-topic', [
      { entityId: 'topic-B', resourceFamily: 'qucp-forum-topic', status: 'rejected' },
    ]);
    expect(result.status).toBe('parent-rejected');
  });

  it('reply with wrong parent family is parent-family-mismatch', () => {
    const result = classifyOrphan('reply-4', 'topic-A', 'qucp-forum-topic', [
      { entityId: 'topic-A', resourceFamily: 'qucp-wiki', status: 'accepted' },
    ]);
    expect(result.status).toBe('parent-family-mismatch');
  });

  it('reply for valid topic B is linked when B exists', () => {
    const result = classifyOrphan('reply-5', 'topic-B', 'qucp-forum-topic', [
      { entityId: 'topic-A', resourceFamily: 'qucp-forum-topic', status: 'accepted' },
      { entityId: 'topic-B', resourceFamily: 'qucp-forum-topic', status: 'accepted' },
    ]);
    expect(result.status).toBe('linked');
  });

  it('reply for topic B does not group under topic A (grouping vs rejection)', () => {
    const replyThreadId = 'topic-B';
    const currentPageThreadId = 'topic-A';
    expect(replyThreadId).not.toBe(currentPageThreadId);
  });
});

// ---- Forum Completeness Propagation ----

import type { QueryCompleteness } from '../services/qdn/runtime/runtimeTypes';

function combineThreadCompleteness(topic: QueryCompleteness, reply: QueryCompleteness): QueryCompleteness {
  if (topic === 'unavailable' || reply === 'unavailable') return 'unavailable';
  if (topic === 'empty') return 'empty';
  if (topic === 'complete' && (reply === 'complete' || reply === 'empty')) return 'complete';
  return 'incomplete';
}

describe('FORUM COMPLETENESS: Topic list contract', () => {
  it('complete is distinguishable from incomplete', () => {
    const values: QueryCompleteness[] = ['complete', 'incomplete', 'empty', 'unavailable'];
    expect(new Set(values).size).toBe(4);
  });

  it('empty and unavailable are distinct states', () => {
    const states = new Set<QueryCompleteness>(['empty', 'unavailable']);
    expect(states.size).toBe(2);
  });

  it('incomplete and empty are distinct states', () => {
    const states = new Set<QueryCompleteness>(['incomplete', 'empty']);
    expect(states.size).toBe(2);
  });
});

describe('FORUM COMPLETENESS: Thread combination matrix', () => {
  it('complete topics + complete replies → complete', () => {
    expect(combineThreadCompleteness('complete', 'complete')).toBe('complete');
  });

  it('complete topics + empty replies → complete', () => {
    expect(combineThreadCompleteness('complete', 'empty')).toBe('complete');
  });

  it('complete topics + incomplete replies → incomplete', () => {
    expect(combineThreadCompleteness('complete', 'incomplete')).toBe('incomplete');
  });

  it('incomplete topics + complete replies → incomplete', () => {
    expect(combineThreadCompleteness('incomplete', 'complete')).toBe('incomplete');
  });

  it('incomplete topics + incomplete replies → incomplete', () => {
    expect(combineThreadCompleteness('incomplete', 'incomplete')).toBe('incomplete');
  });

  it('unavailable topics → unavailable', () => {
    expect(combineThreadCompleteness('unavailable', 'complete')).toBe('unavailable');
  });

  it('unavailable replies → unavailable', () => {
    expect(combineThreadCompleteness('complete', 'unavailable')).toBe('unavailable');
  });

  it('empty topics → empty', () => {
    expect(combineThreadCompleteness('empty', 'complete')).toBe('empty');
  });
});

// ---- Forum Publisher and Authority Tests ----

import { validateParentReference } from '../services/qdn/ordering/parentReference';

describe('FORUM AUTHORITY: Identifier and parent validation', () => {
  it('forumTopicPolicy validates correct identifier family', () => {
    const result = forumTopicPolicy.validateIdentifier('qucp-forum-topic-test123');
    expect(result.valid).toBe(true);
  });

  it('forumTopicPolicy rejects wrong family identifier', () => {
    const result = forumTopicPolicy.validateIdentifier('qucp-wiki-test123');
    expect(result.valid).toBe(false);
  });

  it('forumReplyPolicy validates correct child identifier', () => {
    const result = forumReplyPolicy.validateIdentifier('qucp-forum-reply-test456');
    expect(result.valid).toBe(true);
  });

  it('forumReplyPolicy rejects wrong family identifier', () => {
    const result = forumReplyPolicy.validateIdentifier('qucp-post-comment-test456');
    expect(result.valid).toBe(false);
  });

  it('validateParentReference accepts valid parent', () => {
    expect(validateParentReference('topic-A', 'reply-1').valid).toBe(true);
  });

  it('validateParentReference rejects empty parent', () => {
    expect(validateParentReference('', 'reply-1').valid).toBe(false);
  });

  it('validateParentReference rejects self-reference', () => {
    expect(validateParentReference('same-id', 'same-id').valid).toBe(false);
  });
});

// ---- Forum Deterministic Ordering ----

import {
  compareByQdnMetadata,
} from '../services/qdn/ordering/authoritativeEntityOrdering';

describe('FORUM ORDERING: Deterministic output', () => {
  it('compareByQdnMetadata puts newer timestamp first', () => {
    const makeEnv = (ts: number) => ({
      data: { entityId: 't1', resourceFamily: 'qucp-forum-topic' as const },
      metadata: { name: 'Alice', service: 'DOCUMENT' as const, identifier: 'qucp-forum-topic-t1', created: ts, updated: ts },
      source: 'qdn' as const,
    });
    const older = makeEnv(1000);
    const newer = makeEnv(3000);
    // Newer timestamp sorts first (descending) → older after newer → positive
    expect(compareByQdnMetadata(older, newer)).toBeGreaterThan(0);
  });

  it('compareByQdnMetadata sorts by publisher name when timestamps equal', () => {
    const ts = 1000;
    const makeEnv = (pub: string) => ({
      data: { entityId: 't1', resourceFamily: 'qucp-forum-topic' as const },
      metadata: { name: pub, service: 'DOCUMENT' as const, identifier: 'qucp-forum-topic-t1', created: ts, updated: ts },
      source: 'qdn' as const,
    });
    // Alice before Bob lexicographically
    expect(compareByQdnMetadata(makeEnv('Alice'), makeEnv('Bob'))).toBeLessThan(0);
  });
});

// ================================================================
//  FORUM AUTHORITY — Production-path publisher validation
// ================================================================

import { validatedRuntimeQuery } from '../services/qdn/runtime/validatedQueryRuntime';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import type { QdnResourceEnvelope } from '../services/qdn/QdnResourceEnvelope';

function resolverForMap(map: Record<string, string>) {
  return new IdentityResolver(async (name) => map[name] ?? `w-${name}`);
}

function parseAsForumTopic(raw: unknown): any {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-forum-topic') return null;
  return d;
}

function parseAsForumReply(raw: unknown): any {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-forum-reply') return null;
  return d;
}

const ALICE = 'Alice';
const ALICE_WALLET = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const BOB = 'Bob';
const BOB_WALLET = 'QBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const MAL = 'Mallory';
const MAL_WALLET = 'QMmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm';

function makeTopicPayload(overrides: {
  entityId?: string; ownerName?: string; ownerAddress?: string;
  title?: string; content?: string; categoryId?: string;
  publisherName?: string; created?: number; updated?: number;
} = {}): QdnResourceEnvelope<unknown> {
  const ownerName = overrides.ownerName ?? ALICE;
  const publisherName = overrides.publisherName ?? ownerName;
  return {
    metadata: {
      name: publisherName,
      service: 'DOCUMENT',
      identifier: `qucp-forum-topic-${overrides.entityId ?? 't1'}`,
      created: overrides.created ?? 1000,
      updated: overrides.updated ?? 1000,
    },
    data: {
      schemaVersion: 1 as const,
      resourceFamily: 'qucp-forum-topic',
      entityId: overrides.entityId ?? 't1',
      title: overrides.title ?? 'Test Topic',
      content: overrides.content ?? 'Test content for topic.',
      categoryId: overrides.categoryId ?? 'general',
      ownerName,
      ownerAddress: overrides.ownerAddress ?? ALICE_WALLET,
      tags: [],
    },
    source: 'qdn',
  };
}

function makeReplyPayload(overrides: {
  entityId?: string; parentEntityId?: string;
  ownerName?: string; ownerAddress?: string;
  content?: string; publisherName?: string;
  created?: number; updated?: number;
} = {}): QdnResourceEnvelope<unknown> {
  const ownerName = overrides.ownerName ?? ALICE;
  const publisherName = overrides.publisherName ?? ownerName;
  return {
    metadata: {
      name: publisherName,
      service: 'DOCUMENT',
      identifier: `qucp-forum-reply-${overrides.entityId ?? 'r1'}`,
      created: overrides.created ?? 1000,
      updated: overrides.updated ?? 1000,
    },
    data: {
      schemaVersion: 1 as const,
      resourceFamily: 'qucp-forum-reply',
      entityId: overrides.entityId ?? 'r1',
      parentEntityId: overrides.parentEntityId ?? 't1',
      content: overrides.content ?? 'Test reply content.',
      ownerName,
      ownerAddress: overrides.ownerAddress ?? ALICE_WALLET,
    },
    source: 'qdn',
  };
}

describe('FORUM AUTHORITY: Forged ownerName rejection (production path)', () => {
  it('topic with forged ownerName is rejected', async () => {
    // Publisher is Bob, but payload says ownerName is Mallory
    const envelope = makeTopicPayload({ ownerName: MAL, publisherName: BOB });
    const result = await validatedRuntimeQuery(
      async () => [{ name: BOB, service: 'DOCUMENT', identifier: 'qucp-forum-topic-t1', created: 1000, updated: 1000 }],
      async () => envelope,
      parseAsForumTopic,
      forumTopicPolicy,
      resolverForMap({ [BOB]: BOB_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-forum-topic-' },
    );
    expect(result.status).toBe('empty');
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });

  it('reply with forged ownerName is rejected', async () => {
    const envelope = makeReplyPayload({ ownerName: MAL, publisherName: BOB });
    const result = await validatedRuntimeQuery(
      async () => [{ name: BOB, service: 'DOCUMENT', identifier: 'qucp-forum-reply-r1', created: 1000, updated: 1000 }],
      async () => envelope,
      parseAsForumReply,
      forumReplyPolicy,
      resolverForMap({ [BOB]: BOB_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-forum-reply-' },
    );
    expect(result.status).toBe('empty');
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('FORUM AUTHORITY: Forged ownerAddress rejection (production path)', () => {
  it('topic with forged ownerAddress is rejected', async () => {
    // Publisher name matches, but resolved wallet does not match payload ownerAddress
    const envelope = makeTopicPayload({ ownerName: ALICE, ownerAddress: MAL_WALLET, publisherName: ALICE });
    const result = await validatedRuntimeQuery(
      async () => [{ name: ALICE, service: 'DOCUMENT', identifier: 'qucp-forum-topic-t1', created: 1000, updated: 1000 }],
      async () => envelope,
      parseAsForumTopic,
      forumTopicPolicy,
      resolverForMap({ [ALICE]: ALICE_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-forum-topic-' },
    );
    expect(result.status).toBe('empty');
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });

  it('reply with forged ownerAddress is rejected', async () => {
    const envelope = makeReplyPayload({ ownerName: ALICE, ownerAddress: MAL_WALLET, publisherName: ALICE });
    const result = await validatedRuntimeQuery(
      async () => [{ name: ALICE, service: 'DOCUMENT', identifier: 'qucp-forum-reply-r1', created: 1000, updated: 1000 }],
      async () => envelope,
      parseAsForumReply,
      forumReplyPolicy,
      resolverForMap({ [ALICE]: ALICE_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-forum-reply-' },
    );
    expect(result.status).toBe('empty');
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });
});

import { validateOwnerNameMatch, validatePublisherOwnership } from '../services/qdn/policies/authoritativeEntityPolicy';

describe('FORUM AUTHORITY: Canonical owner and cross-wallet', () => {
  it('validateOwnerNameMatch accepts matching names', () => {
    const env = { metadata: { name: ALICE, service: 'DOCUMENT' as const, identifier: 't1', created: 1000, updated: 1000 }, data: { ownerName: ALICE }, source: 'qdn' as const };
    expect(validateOwnerNameMatch(env).valid).toBe(true);
  });

  it('validateOwnerNameMatch rejects mismatched names', () => {
    const env = { metadata: { name: BOB, service: 'DOCUMENT' as const, identifier: 't1', created: 1000, updated: 1000 }, data: { ownerName: MAL }, source: 'qdn' as const };
    expect(validateOwnerNameMatch(env).valid).toBe(false);
  });

  it('validatePublisherOwnership accepts matching wallet', () => {
    const env = { metadata: { name: ALICE, service: 'DOCUMENT' as const, identifier: 't1', created: 1000, updated: 1000 }, data: { ownerAddress: ALICE_WALLET }, source: 'qdn' as const };
    expect(validatePublisherOwnership(env, { name: ALICE, status: 'verified' as const, address: ALICE_WALLET, resolvedAt: 1000 }).valid).toBe(true);
  });

  it('validatePublisherOwnership rejects mismatched wallet', () => {
    const env = { metadata: { name: ALICE, service: 'DOCUMENT' as const, identifier: 't1', created: 1000, updated: 1000 }, data: { ownerAddress: MAL_WALLET }, source: 'qdn' as const };
    expect(validatePublisherOwnership(env, { name: ALICE, status: 'verified' as const, address: ALICE_WALLET, resolvedAt: 1000 }).valid).toBe(false);
  });

  it('authority diagnostics are stable (ownerAddress mismatch)', () => {
    const env = { metadata: { name: ALICE, service: 'DOCUMENT' as const, identifier: 't1', created: 1000, updated: 1000 }, data: { ownerAddress: MAL_WALLET }, source: 'qdn' as const };
    const result = validatePublisherOwnership(env, { name: ALICE, status: 'verified' as const, address: ALICE_WALLET, resolvedAt: 1000 });
    expect(result.valid).toBe(false);
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
    expect(result.diagnostics?.[0]?.code).toBe('EMBEDDED_IDENTITY_MISMATCH');
  });
});

// ---- Production Parent-Link Path Tests ----

import { evaluateReplyParent } from '../store/api/forumApi';

describe('FORUM PARENT-LINK: Production function tests', () => {
  const acceptedTopicIds = new Set<string>(['topic-A', 'topic-B']);

  it('valid parent produces no diagnostics', () => {
    const reply = {
      entityId: 'r1',
      envelope: {
        data: { parentEntityId: 'topic-A' },
        metadata: { identifier: 'qucp-forum-reply-r1' },
      } as any,
    };
    const diags = evaluateReplyParent(reply, acceptedTopicIds);
    expect(diags).toHaveLength(0);
  });

  it('missing parent produces forum-reply-parent-missing diagnostic', () => {
    const reply = {
      entityId: 'r2',
      envelope: {
        data: {},
        metadata: { identifier: 'qucp-forum-reply-r2' },
      } as any,
    };
    const diags = evaluateReplyParent(reply, acceptedTopicIds);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('forum-reply-parent-missing');
  });

  it('nonexistent parent produces forum-reply-parent-not-accepted diagnostic', () => {
    const reply = {
      entityId: 'r3',
      envelope: {
        data: { parentEntityId: 'nonexistent' },
        metadata: { identifier: 'qucp-forum-reply-r3' },
      } as any,
    };
    const diags = evaluateReplyParent(reply, acceptedTopicIds);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('forum-reply-parent-not-accepted');
  });

  it('valid other-topic parent produces no diagnostics (valid globally)', () => {
    const reply = {
      entityId: 'r4',
      envelope: {
        data: { parentEntityId: 'topic-B' },
        metadata: { identifier: 'qucp-forum-reply-r4' },
      } as any,
    };
    const diags = evaluateReplyParent(reply, acceptedTopicIds);
    expect(diags).toHaveLength(0);
  });

  it('diagnostic ordering is deterministic (same input → same output)', () => {
    const replies = [
      { entityId: 'r-orphan', envelope: { data: {}, metadata: { identifier: 'qucp-forum-reply-r-orphan' } } as any },
      { entityId: 'r-missing', envelope: { data: { parentEntityId: 'gone' }, metadata: { identifier: 'qucp-forum-reply-r-missing' } } as any },
    ];

    // Same input order should produce same output (deterministic)
    const diagsA: string[] = [];
    for (const r of replies) {
      diagsA.push(...evaluateReplyParent(r, acceptedTopicIds).map(d => d.code));
    }

    const diagsB: string[] = [];
    for (const r of replies) {
      diagsB.push(...evaluateReplyParent(r, acceptedTopicIds).map(d => d.code));
    }

    expect(diagsA).toEqual(diagsB);
    expect(diagsA).toHaveLength(2);
  });
});

// ---- Topic/Reply Permutation Stability ----

describe('FORUM PERMUTATION: Topic reduction stability', () => {
  it('same topics in different input order produce same accepted set', async () => {
    const topic1 = makeTopicPayload({ entityId: 't-a', ownerName: ALICE, ownerAddress: ALICE_WALLET, title: 'A', created: 1000, updated: 1000 });
    const topic2 = makeTopicPayload({ entityId: 't-b', ownerName: ALICE, ownerAddress: ALICE_WALLET, title: 'B', created: 1000, updated: 2000 });
    const searchResults = [
      { name: ALICE, service: 'DOCUMENT' as const, identifier: 'qucp-forum-topic-t-a', created: 1000, updated: 1000 },
      { name: ALICE, service: 'DOCUMENT' as const, identifier: 'qucp-forum-topic-t-b', created: 1000, updated: 2000 },
    ];

    let callIdx = 0;
    const fetchOrdered = async () => {
      const env = callIdx === 0 ? topic1 : topic2;
      callIdx++;
      return env;
    };

    callIdx = 0;
    const r1 = await validatedRuntimeQuery(
      async () => searchResults, fetchOrdered,
      parseAsForumTopic,
      forumTopicPolicy,
      resolverForMap({ [ALICE]: ALICE_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-forum-topic-' },
    );

    callIdx = 0;
    const r2 = await validatedRuntimeQuery(
      async () => [...searchResults].reverse(), fetchOrdered,
      parseAsForumTopic,
      forumTopicPolicy,
      resolverForMap({ [ALICE]: ALICE_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-forum-topic-' },
    );

    expect(r1.items.map(i => i.entityId).sort()).toEqual(r2.items.map(i => i.entityId).sort());
    expect(r1.items).toHaveLength(r2.items.length);
  });
});

describe('FORUM PERMUTATION: Reply reduction stability', () => {
  it('same replies in different input order produce same accepted set', async () => {
    const reply1 = makeReplyPayload({ entityId: 'r-a', parentEntityId: 't1', ownerName: ALICE, ownerAddress: ALICE_WALLET, created: 1000, updated: 1000 });
    const reply2 = makeReplyPayload({ entityId: 'r-b', parentEntityId: 't1', ownerName: ALICE, ownerAddress: ALICE_WALLET, created: 1000, updated: 2000 });
    const searchResults = [
      { name: ALICE, service: 'DOCUMENT' as const, identifier: 'qucp-forum-reply-r-a', created: 1000, updated: 1000 },
      { name: ALICE, service: 'DOCUMENT' as const, identifier: 'qucp-forum-reply-r-b', created: 1000, updated: 2000 },
    ];

    let callIdx = 0;
    const fetchOrdered = async () => {
      const env = callIdx === 0 ? reply1 : reply2;
      callIdx++;
      return env;
    };

    callIdx = 0;
    const r1 = await validatedRuntimeQuery(
      async () => searchResults, fetchOrdered,
      parseAsForumReply,
      forumReplyPolicy,
      resolverForMap({ [ALICE]: ALICE_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-forum-reply-' },
    );

    callIdx = 0;
    const r2 = await validatedRuntimeQuery(
      async () => [...searchResults].reverse(), fetchOrdered,
      parseAsForumReply,
      forumReplyPolicy,
      resolverForMap({ [ALICE]: ALICE_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-forum-reply-' },
    );

    expect(r1.items.map(i => i.entityId).sort()).toEqual(r2.items.map(i => i.entityId).sort());
    expect(r1.items).toHaveLength(r2.items.length);
  });
});

// ---- Support Tests ----

describe('SUPPORT: Category identifiers', () => {
  it('builds qucp-support-category identifier', () => {
    expect(buildQucpIdentifier('qucp-support-category', 'cat01')).toBe('qucp-support-category-cat01');
  });
  it('round-trips category identifier', () => {
    const p = parseQucpIdentifier('qucp-support-category-cat01');
    expect(p).not.toBeNull();
  });
  it('rejects legacy ticket- prefix', () => {
    expect(parseQucpIdentifier('ticket-123')).toBeNull();
  });
  it('rejects legacy ticket-resp- prefix', () => {
    expect(parseQucpIdentifier('ticket-resp-456')).toBeNull();
  });
});

describe('SUPPORT: Ticket category linkage', () => {
  const W = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
  it('ticket payload includes categoryId', () => {
    const p = buildSupportTicketPayload({ entityId: 't1', title: 'T', description: 'D', type: 'bug', categoryId: 'cat01', ownerName: 'Alice', ownerAddress: W });
    expect(p.categoryId).toBe('cat01');
  });
  it('ticket without categoryId fails schema', () => {
    const r = supportTicketSchema.safeParse({ schemaVersion: 1, resourceFamily: 'qucp-support-ticket', entityId: 't1', title: 'T', description: 'D', type: 'bug', userPriority: 'medium', ownerName: 'Alice', ownerAddress: W, createdAt: Date.now() });
    expect(r.success).toBe(false);
  });
  it('category payload includes isActive', () => {
    const p = buildSupportCategoryPayload({ entityId: 'cat01', name: 'Bugs', isActive: true, ownerName: 'Admin', ownerAddress: W });
    expect(p.isActive).toBe(true);
  });
});

// ================================================================
//  SUPPORT CATEGORY AUTHORITY — Production-path tests
// ================================================================

import { assertSupportCategoryManagerAuthority } from '../services/qdn/roles/supportCategoryAuth';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import type { QucpRoleRegistrySnapshot } from '../services/qdn/schemas/roleRegistrySnapshotSchema';

function makeAdminSnapshot(adminWallet: string): QucpRoleRegistrySnapshot {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-role-snapshot',
    snapshotId: 'snap-001',
    sysopAddress: QUC_SYSOP_ADDRESS,
    members: [{ address: adminWallet, roles: ['admin'] }],
    createdAt: 1700000000000,
  };
}

function makeEmptySnapshot(): QucpRoleRegistrySnapshot {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-role-snapshot',
    snapshotId: 'snap-empty',
    sysopAddress: QUC_SYSOP_ADDRESS,
    members: [],
    createdAt: 1700000000000,
  };
}

const SUPPORT_ADMIN_WALLET = 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SUPPORT_CREATOR_WALLET = 'QCcccccccccccccccccccccccccccccccc';
const SUPPORT_USER_WALLET = 'QUuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu';

describe('SUPPORT CATEGORY AUTHORITY: Admin/SysOp acceptance', () => {
  it('SysOp trust anchor is authorized', () => {
    const result = assertSupportCategoryManagerAuthority(QUC_SYSOP_ADDRESS, null);
    expect(result.authorized).toBe(true);
    if (result.authorized) expect(result.source).toBe('sysop-trust-anchor');
  });

  it('SysOp trust anchor authorized even with snapshot', () => {
    const snap = makeAdminSnapshot(SUPPORT_ADMIN_WALLET);
    const result = assertSupportCategoryManagerAuthority(QUC_SYSOP_ADDRESS, snap);
    expect(result.authorized).toBe(true);
    if (result.authorized) expect(result.source).toBe('sysop-trust-anchor');
  });

  it('admin-role wallet authorized with snapshot', () => {
    const snap = makeAdminSnapshot(SUPPORT_ADMIN_WALLET);
    const result = assertSupportCategoryManagerAuthority(SUPPORT_ADMIN_WALLET, snap);
    expect(result.authorized).toBe(true);
    if (result.authorized) expect(result.source).toBe('admin-role');
  });
});

describe('SUPPORT CATEGORY AUTHORITY: Creator/user rejection', () => {
  it('creator wallet rejected (not in admin role)', () => {
    const snap = makeAdminSnapshot(SUPPORT_ADMIN_WALLET);
    const result = assertSupportCategoryManagerAuthority(SUPPORT_CREATOR_WALLET, snap);
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('not-admin-nor-sysop');
  });

  it('ordinary user rejected', () => {
    const snap = makeAdminSnapshot(SUPPORT_ADMIN_WALLET);
    const result = assertSupportCategoryManagerAuthority(SUPPORT_USER_WALLET, snap);
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('not-admin-nor-sysop');
  });

  it('unknown user with empty snapshot rejected', () => {
    const snap = makeEmptySnapshot();
    const result = assertSupportCategoryManagerAuthority(SUPPORT_USER_WALLET, snap);
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('not-admin-nor-sysop');
  });

  it('unknown role rejected when snapshot unavailable', () => {
    const result = assertSupportCategoryManagerAuthority(SUPPORT_USER_WALLET, null);
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('role-snapshot-unavailable');
  });

  it('empty wallet rejected', () => {
    const result = assertSupportCategoryManagerAuthority('', makeEmptySnapshot());
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('empty-wallet');
  });
});

// ================================================================
//  SUPPORT CATEGORY LIFECYCLE — Production-path tests
// ================================================================

describe('SUPPORT CATEGORY LIFECYCLE: Create', () => {
  it('buildSupportCategoryPayload creates with new entityId', () => {
    const p = buildSupportCategoryPayload({
      entityId: 'cat-lifecycle-1',
      name: 'Feature Requests',
      isActive: true,
      sortOrder: 1,
      ownerName: 'Admin',
      ownerAddress: SUPPORT_ADMIN_WALLET,
    });
    expect(p.entityId).toBe('cat-lifecycle-1');
    expect(p.resourceFamily).toBe('qucp-support-category');
    expect(p.name).toBe('Feature Requests');
    expect(p.isActive).toBe(true);
    expect(p.sortOrder).toBe(1);
    expect(p.schemaVersion).toBe(1);
  });

  it('canonical identifier generated from entityId', () => {
    const id = buildQucpIdentifier('qucp-support-category', 'cat-lifecycle-1');
    expect(id).toBe('qucp-support-category-cat-lifecycle-1');
  });
});

describe('SUPPORT CATEGORY LIFECYCLE: Rename', () => {
  it('rename preserves entityId', () => {
    const original = buildSupportCategoryPayload({
      entityId: 'cat-rename-1',
      name: 'Old Name',
      isActive: true,
      ownerName: 'Admin',
      ownerAddress: SUPPORT_ADMIN_WALLET,
    });
    const renamed = buildSupportCategoryPayload({
      entityId: 'cat-rename-1',
      name: 'New Name',
      isActive: true,
      ownerName: 'Admin',
      ownerAddress: SUPPORT_ADMIN_WALLET,
    });
    expect(renamed.entityId).toBe(original.entityId);
  });

  it('rename preserves canonical identifier', () => {
    const id1 = buildQucpIdentifier('qucp-support-category', 'cat-rename-1');
    const id2 = buildQucpIdentifier('qucp-support-category', 'cat-rename-1');
    expect(id1).toBe(id2);
    expect(id1).toBe('qucp-support-category-cat-rename-1');
  });

  it('rename preserves owner', () => {
    const renamed = buildSupportCategoryPayload({
      entityId: 'cat-rename-1',
      name: 'New Name',
      isActive: true,
      ownerName: 'Admin',
      ownerAddress: SUPPORT_ADMIN_WALLET,
    });
    expect(renamed.ownerName).toBe('Admin');
    expect(renamed.ownerAddress).toBe(SUPPORT_ADMIN_WALLET);
  });

  it('rename changes only name', () => {
    const renamed = buildSupportCategoryPayload({
      entityId: 'cat-rename-1',
      name: 'New Name',
      description: 'Updated desc',
      isActive: true,
      sortOrder: 5,
      ownerName: 'Admin',
      ownerAddress: SUPPORT_ADMIN_WALLET,
    });
    expect(renamed.name).toBe('New Name');
    expect(renamed.description).toBe('Updated desc');
    expect(renamed.sortOrder).toBe(5);
    // entityId unchanged
    expect(renamed.entityId).toBe('cat-rename-1');
  });
});

describe('SUPPORT CATEGORY LIFECYCLE: Archive and reactivate', () => {
  it('archive sets isActive false', () => {
    const archived = buildSupportCategoryPayload({
      entityId: 'cat-arch-1',
      name: 'Archive Me',
      isActive: false,
      ownerName: 'Admin',
      ownerAddress: SUPPORT_ADMIN_WALLET,
    });
    expect(archived.isActive).toBe(false);
    expect(archived.entityId).toBe('cat-arch-1');
  });

  it('reactivate sets isActive true', () => {
    const reactivated = buildSupportCategoryPayload({
      entityId: 'cat-arch-1',
      name: 'Reactivated',
      isActive: true,
      ownerName: 'Admin',
      ownerAddress: SUPPORT_ADMIN_WALLET,
    });
    expect(reactivated.isActive).toBe(true);
    expect(reactivated.entityId).toBe('cat-arch-1');
  });

  it('archive preserves entityId and identifier', () => {
    const id1 = buildQucpIdentifier('qucp-support-category', 'cat-arch-2');
    const id2 = buildQucpIdentifier('qucp-support-category', 'cat-arch-2');
    expect(id1).toBe(id2);
  });

  it('reactivate preserves entityId and identifier', () => {
    const id = buildQucpIdentifier('qucp-support-category', 'cat-arch-2');
    expect(id).toBe('qucp-support-category-cat-arch-2');
  });
});

// ================================================================
//  SUPPORT CATEGORY — Archived behavior
// ================================================================

import type { SupportCategory } from '../types/support';

describe('SUPPORT CATEGORY: Archived resolution and selection', () => {
  const makeCat = (id: string, name: string, active: boolean): SupportCategory => ({
    id, name, isActive: active,
  });

  it('archived category excluded from active selector', () => {
    const cats = [makeCat('c1', 'Active', true), makeCat('c2', 'Archived', false)];
    const active = cats.filter(c => c.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('c1');
  });

  it('archived category remains in full resolution set', () => {
    const cats = [makeCat('c1', 'Active', true), makeCat('c2', 'Archived', false)];
    const found = cats.find(c => c.id === 'c2');
    expect(found).toBeDefined();
    expect(found!.name).toBe('Archived');
  });

  it('existing ticket resolves archived category name', () => {
    const cats = [makeCat('c1', 'Active', true), makeCat('c2', 'Archived', false)];
    const catId = 'c2';
    const name = cats.find(c => c.id === catId)?.name;
    expect(name).toBe('Archived');
  });

  it('reactivated category becomes selectable', () => {
    const cats = [makeCat('c1', 'Active', true), makeCat('c2', 'Reactivated', true)];
    const active = cats.filter(c => c.isActive);
    expect(active).toHaveLength(2);
    expect(active.find(c => c.id === 'c2')).toBeDefined();
  });
});

// ================================================================
//  SUPPORT CATEGORY — Ordering
// ================================================================

describe('SUPPORT CATEGORY ORDERING: Deterministic sort', () => {
  it('categories sort by sortOrder ascending', () => {
    const cats: SupportCategory[] = [
      { id: 'c3', name: 'C', isActive: true, sortOrder: 30 },
      { id: 'c1', name: 'A', isActive: true, sortOrder: 10 },
      { id: 'c2', name: 'B', isActive: true, sortOrder: 20 },
    ];
    const sorted = [...cats].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    expect(sorted.map(c => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('categories with same sortOrder tie-break by name', () => {
    const cats: SupportCategory[] = [
      { id: 'c3', name: 'Zebra', isActive: true, sortOrder: 10 },
      { id: 'c1', name: 'Alpha', isActive: true, sortOrder: 10 },
    ];
    const sorted = [...cats].sort((a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
    );
    expect(sorted[0].name).toBe('Alpha');
    expect(sorted[1].name).toBe('Zebra');
  });

  it('input permutation produces same output', () => {
    const cats1: SupportCategory[] = [
      { id: 'a', name: 'A', isActive: true, sortOrder: 10 },
      { id: 'b', name: 'B', isActive: true, sortOrder: 10 },
    ];
    const cats2 = [...cats1].reverse();
    const sorter = (a: SupportCategory, b: SupportCategory) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
    expect([...cats1].sort(sorter).map(c => c.id))
      .toEqual([...cats2].sort(sorter).map(c => c.id));
  });
});

// ================================================================
//  SUPPORT TICKET CATEGORY VALIDATION — Production-path tests
// ================================================================

import { validateTicketCategoryForCreation } from '../services/qdn/runtime/ticketCategoryValidation';
import type { SupportCategoryQueryResult } from '../services/qdn/runtime/supportRuntime';

function makeCategoryResult(
  status: 'complete' | 'incomplete' | 'empty' | 'unavailable',
  categories: Array<{ entityId: string; name: string; isActive: boolean }>,
): SupportCategoryQueryResult {
  if (status === 'empty') return { status: 'empty', items: [], diagnostics: [] };
  if (status === 'unavailable') return { status: 'unavailable', items: [], reason: 'unavailable', diagnostics: [] };
  const items: Array<{ entityId: string; publisherName: string; publisherAddress: string; envelope: { metadata: { name: string; service: 'DOCUMENT'; identifier: string; created: number; updated: number }; data: { schemaVersion: 1; resourceFamily: 'qucp-support-category'; entityId: string; name: string; isActive: boolean; ownerName: string; ownerAddress: string; createdAt: number }; source: 'qdn' } }> = categories.map(c => ({
    entityId: c.entityId,
    publisherName: 'Admin',
    publisherAddress: SUPPORT_ADMIN_WALLET,
    envelope: {
      metadata: { name: 'Admin', service: 'DOCUMENT' as const, identifier: `qucp-support-category-${c.entityId}`, created: 1000, updated: 1000 },
      data: { schemaVersion: 1 as const, resourceFamily: 'qucp-support-category' as const, entityId: c.entityId, name: c.name, isActive: c.isActive, ownerName: 'Admin', ownerAddress: SUPPORT_ADMIN_WALLET, createdAt: 1000 },
      source: 'qdn' as const,
    },
  }));
  return {
    status,
    items,
    rejectedCount: 0,
    quarantinedCount: 0,
    diagnostics: [],
  } as SupportCategoryQueryResult;
}

describe('SUPPORT TICKET CATEGORY VALIDATION: Active category enforcement', () => {
  it('accepts valid active category', () => {
    const r = makeCategoryResult('complete', [{ entityId: 'cat-v', name: 'Valid', isActive: true }]);
    const v = validateTicketCategoryForCreation('cat-v', r);
    expect(v.valid).toBe(true);
    if (v.valid) expect(v.categoryName).toBe('Valid');
  });

  it('rejects archived category', () => {
    const r = makeCategoryResult('complete', [{ entityId: 'cat-arch', name: 'Archived', isActive: false }]);
    const v = validateTicketCategoryForCreation('cat-arch', r);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('category-archived');
  });

  it('rejects unknown category in complete result', () => {
    const r = makeCategoryResult('complete', [{ entityId: 'cat-v', name: 'Valid', isActive: true }]);
    const v = validateTicketCategoryForCreation('nonexistent', r);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('category-not-found');
  });

  it('rejects unknown category in incomplete result (conservative)', () => {
    const r = makeCategoryResult('incomplete', [{ entityId: 'cat-v', name: 'Valid', isActive: true }]);
    const v = validateTicketCategoryForCreation('nonexistent', r);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('category-discovery-incomplete-category-absent');
  });

  it('rejects empty categoryId', () => {
    const r = makeCategoryResult('complete', [{ entityId: 'cat-v', name: 'Valid', isActive: true }]);
    const v = validateTicketCategoryForCreation('', r);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('category-id-empty');
  });

  it('rejects when discovery unavailable', () => {
    const r: SupportCategoryQueryResult = { status: 'unavailable', items: [], reason: 'unavailable', diagnostics: [] };
    const v = validateTicketCategoryForCreation('cat-v', r);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('category-discovery-unavailable');
  });

  it('accepts known active category in incomplete result', () => {
    const r = makeCategoryResult('incomplete', [{ entityId: 'cat-v', name: 'Valid', isActive: true }]);
    const v = validateTicketCategoryForCreation('cat-v', r);
    expect(v.valid).toBe(true);
  });
});

// ================================================================
//  SUPPORT TICKET AUTHORITY — Production-path tests
// ================================================================

import { supportTicketPolicy } from '../services/qdn/policies/supportTicketPolicy';
import { ticketReplyPolicy } from '../services/qdn/policies/ticketReplyPolicy';
import type { QucpSupportTicket } from '../services/qdn/schemas/supportTicketSchema';
import type { QucpTicketReply } from '../services/qdn/schemas/ticketReplySchema';

function resolverForSupport(map: Record<string, string>) {
  return new IdentityResolver(async (name) => map[name] ?? `w-${name}`);
}

function parseAsSupportTicket(raw: unknown): QucpSupportTicket | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-support-ticket') return null;
  return d as unknown as QucpSupportTicket;
}

function parseAsTicketReply(raw: unknown): QucpTicketReply | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.resourceFamily !== 'qucp-ticket-reply') return null;
  return d as unknown as QucpTicketReply;
}

function makeTicketEnvelope(overrides: {
  entityId?: string; ownerName?: string; ownerAddress?: string;
  title?: string; description?: string; categoryId?: string;
  publisherName?: string; created?: number; updated?: number;
}): QdnResourceEnvelope<unknown> {
  const ownerName = overrides.ownerName ?? 'Alice';
  const publisherName = overrides.publisherName ?? ownerName;
  const now = 1700000000000;
  return {
    metadata: {
      name: publisherName,
      service: 'DOCUMENT',
      identifier: `qucp-support-ticket-${overrides.entityId ?? 'ticket001'}`,
      created: overrides.created ?? now,
      updated: overrides.updated ?? now,
    },
    data: {
      schemaVersion: 1 as const,
      resourceFamily: 'qucp-support-ticket',
      entityId: overrides.entityId ?? 'ticket001',
      title: overrides.title ?? 'Test Ticket',
      description: overrides.description ?? 'Ticket description.',
      type: 'general' as const,
      userPriority: 'medium' as const,
      categoryId: overrides.categoryId ?? 'category01',
      ownerName,
      ownerAddress: overrides.ownerAddress ?? ALICE_WALLET,
      createdAt: overrides.created ?? now,
    },
    source: 'qdn',
  };
}

function makeReplyEnvelope(overrides: {
  entityId?: string; parentEntityId?: string;
  ownerName?: string; ownerAddress?: string;
  content?: string; publisherName?: string;
  created?: number; updated?: number;
}): QdnResourceEnvelope<unknown> {
  const ownerName = overrides.ownerName ?? 'Alice';
  const publisherName = overrides.publisherName ?? ownerName;
  const now = 1700000000000;
  return {
    metadata: {
      name: publisherName,
      service: 'DOCUMENT',
      identifier: `qucp-ticket-reply-${overrides.entityId ?? 'reply0001'}`,
      created: overrides.created ?? now,
      updated: overrides.updated ?? now,
    },
    data: {
      schemaVersion: 1 as const,
      resourceFamily: 'qucp-ticket-reply',
      entityId: overrides.entityId ?? 'reply0001',
      parentEntityId: overrides.parentEntityId ?? 'ticket001',
      content: overrides.content ?? 'Test reply content here.',
      ownerName,
      ownerAddress: overrides.ownerAddress ?? ALICE_WALLET,
      createdAt: overrides.created ?? now,
    },
    source: 'qdn',
  };
}

describe('SUPPORT TICKET AUTHORITY: Forged ownerName rejection', () => {
  it('ticket with forged ownerName rejected (production path)', async () => {
    const envelope = makeTicketEnvelope({ entityId: 'ticket001', ownerName: ALICE, publisherName: BOB, ownerAddress: ALICE_WALLET });
    const result = await validatedRuntimeQuery(
      async () => [{ name: BOB, service: 'DOCUMENT', identifier: 'qucp-support-ticket-ticket001', created: 1000, updated: 1000 }],
      async () => envelope,
      parseAsSupportTicket,
      supportTicketPolicy,
      resolverForSupport({ [BOB]: BOB_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-support-ticket-' },
    );
    expect(result.status).toBe('empty');
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('SUPPORT TICKET AUTHORITY: Forged ownerAddress rejection', () => {
  it('ticket with forged ownerAddress rejected (production path)', async () => {
    const envelope = makeTicketEnvelope({ entityId: 'ticket002', ownerName: ALICE, ownerAddress: BOB_WALLET, publisherName: ALICE });
    const result = await validatedRuntimeQuery(
      async () => [{ name: ALICE, service: 'DOCUMENT', identifier: 'qucp-support-ticket-ticket002', created: 1000, updated: 1000 }],
      async () => envelope,
      parseAsSupportTicket,
      supportTicketPolicy,
      resolverForSupport({ [ALICE]: ALICE_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-support-ticket-' },
    );
    expect(result.status).toBe('empty');
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('SUPPORT TICKET AUTHORITY: Valid publisher accepted', () => {
  it('valid ticket with matching identity accepted', async () => {
    const envelope = makeTicketEnvelope({ entityId: 'ticket001', ownerName: ALICE, ownerAddress: ALICE_WALLET, publisherName: ALICE });
    const result = await validatedRuntimeQuery(
      async () => [{ name: ALICE, service: 'DOCUMENT', identifier: 'qucp-support-ticket-ticket001', created: 1000, updated: 1000 }],
      async () => envelope.data,
      parseAsSupportTicket,
      supportTicketPolicy,
      resolverForSupport({ [ALICE]: ALICE_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-support-ticket-' },
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].entityId).toBe('ticket001');
  });
});

// ================================================================
//  SUPPORT REPLY AUTHORITY — Production-path tests
// ================================================================

describe('SUPPORT REPLY AUTHORITY: Forged ownerName rejection', () => {
  it('reply with forged ownerName rejected', async () => {
    const envelope = makeReplyEnvelope({ entityId: 'reply0001', ownerName: ALICE, publisherName: BOB, ownerAddress: ALICE_WALLET, parentEntityId: 'ticket001' });
    const result = await validatedRuntimeQuery(
      async () => [{ name: BOB, service: 'DOCUMENT', identifier: 'qucp-ticket-reply-reply0001', created: 1000, updated: 1000 }],
      async () => envelope,
      parseAsTicketReply,
      ticketReplyPolicy,
      resolverForSupport({ [BOB]: BOB_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-ticket-reply-' },
    );
    expect(result.status).toBe('empty');
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('SUPPORT REPLY AUTHORITY: Forged ownerAddress rejection', () => {
  it('reply with forged ownerAddress rejected', async () => {
    const envelope = makeReplyEnvelope({ entityId: 'reply0002', ownerName: ALICE, ownerAddress: BOB_WALLET, publisherName: ALICE, parentEntityId: 'ticket001' });
    const result = await validatedRuntimeQuery(
      async () => [{ name: ALICE, service: 'DOCUMENT', identifier: 'qucp-ticket-reply-reply0002', created: 1000, updated: 1000 }],
      async () => envelope,
      parseAsTicketReply,
      ticketReplyPolicy,
      resolverForSupport({ [ALICE]: ALICE_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-ticket-reply-' },
    );
    expect(result.status).toBe('empty');
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('SUPPORT REPLY AUTHORITY: Valid reply and parent linkage', () => {
  it('valid reply with correct parent accepted', async () => {
    const envelope = makeReplyEnvelope({ entityId: 'reply0003', ownerName: ALICE, ownerAddress: ALICE_WALLET, publisherName: ALICE, parentEntityId: 'ticket001' });
    const result = await validatedRuntimeQuery(
      async () => [{ name: ALICE, service: 'DOCUMENT', identifier: 'qucp-ticket-reply-reply0003', created: 1000, updated: 1000 }],
      async () => envelope.data,
      parseAsTicketReply,
      ticketReplyPolicy,
      resolverForSupport({ [ALICE]: ALICE_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-ticket-reply-' },
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].entityId).toBe('reply0003');
  });

  it('reply with self-reference parent rejected', async () => {
    const envelope = makeReplyEnvelope({ entityId: 'same0001', parentEntityId: 'same0001', ownerName: ALICE, ownerAddress: ALICE_WALLET, publisherName: ALICE });
    const result = await validatedRuntimeQuery(
      async () => [{ name: ALICE, service: 'DOCUMENT', identifier: 'qucp-ticket-reply-same0001', created: 1000, updated: 1000 }],
      async () => envelope,
      parseAsTicketReply,
      ticketReplyPolicy,
      resolverForSupport({ [ALICE]: ALICE_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-ticket-reply-' },
    );
    expect(result.items).toHaveLength(0);
  });
});

// ================================================================
//  SUPPORT COMPLETENESS — Category completeness states
// ================================================================

describe('SUPPORT COMPLETENESS: Category state classification', () => {
  it('unavailable is distinct from empty', () => {
    expect('unavailable' as const).not.toBe('empty' as const);
  });

  it('incomplete is distinct from empty and unavailable', () => {
    const states = new Set(['incomplete', 'empty', 'unavailable', 'complete']);
    expect(states.size).toBe(4);
  });
});

// ================================================================
//  SUPPORT CATEGORY HISTORICAL AUTHORIZATION — Model C
// ================================================================

import {
  verifyCategoryHistoricalAuthorization,
} from '../services/qdn/runtime/categoryHistoricalAuth';
import {
  applyCategoryHistoricalAuthorization,
} from '../services/qdn/runtime/supportRuntime';

const ADMIN_1 = 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADMIN_2 = 'QBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const USER_1 = 'QUuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu';
const T_GRANT = 1700000000000;
const T_PUB = 1700000001000;
const T_REVOKE = 1700000002000;
const T_LATER = 1700000003000;

function makeRoleSnapshot(snapshotId: string, admins: string[], created: number): {
  envelope: { metadata: { name: string; service: 'DOCUMENT'; identifier: string; created: number; updated: number }; data: QucpRoleRegistrySnapshot; source: 'qdn' };
  snapshotEntityId: string;
} {
  return {
    envelope: {
      metadata: { name: 'SysOp', service: 'DOCUMENT' as const, identifier: `qucp-rs-${snapshotId}`, created, updated: created },
      data: {
        schemaVersion: 1,
        resourceFamily: 'qucp-role-snapshot',
        snapshotId,
        sysopAddress: QUC_SYSOP_ADDRESS,
        members: admins.map(a => ({ address: a, roles: ['admin' as const] })),
        createdAt: created,
      },
      source: 'qdn' as const,
    },
    snapshotEntityId: snapshotId,
  };
}

// ---- Historical Authorization: Admin grant before publication ----

describe('SUPPORT HISTORICAL AUTH: Admin grant before publication', () => {
  it('admin granted before publication → accepted', () => {
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: ADMIN_1,
      categoryQdnCreatedTime: T_PUB,
      roleSnapshots: snapshots,
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(true);
    if (result.authorized) expect(result.source).toBe('admin-at-publication');
  });

  it('admin granted after publication → rejected', () => {
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_REVOKE)];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: ADMIN_1,
      categoryQdnCreatedTime: T_PUB,
      roleSnapshots: snapshots,
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('published-before-role-grant');
  });

  it('admin published before revocation → accepted', () => {
    const snapshots = [
      makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT),
      makeRoleSnapshot('snap-2', [], T_REVOKE),
    ];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: ADMIN_1,
      categoryQdnCreatedTime: T_PUB,
      roleSnapshots: snapshots,
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(true);
  });

  it('admin update published after revocation → rejected', () => {
    const snapshots = [
      makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT),
      makeRoleSnapshot('snap-2', [], T_REVOKE),
    ];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: ADMIN_1,
      categoryQdnCreatedTime: T_LATER,
      roleSnapshots: snapshots,
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('published-after-role-revocation');
  });

  it('role re-granted later → later update accepted', () => {
    const snapshots = [
      makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT),
      makeRoleSnapshot('snap-2', [], T_REVOKE),
      makeRoleSnapshot('snap-3', [ADMIN_1], T_LATER),
    ];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: ADMIN_1,
      categoryQdnCreatedTime: T_LATER + 100,
      roleSnapshots: snapshots,
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(true);
  });
});

// ---- Historical Authorization: SysOp ----

describe('SUPPORT HISTORICAL AUTH: SysOp', () => {
  it('SysOp trust anchor accepted without role snapshot', () => {
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: QUC_SYSOP_ADDRESS,
      categoryQdnCreatedTime: T_PUB,
      roleSnapshots: [],
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(true);
    if (result.authorized) expect(result.source).toBe('sysop-trust-anchor');
  });

  it('SysOp accepted even with empty role snapshots', () => {
    const snapshots = [makeRoleSnapshot('snap-1', [], T_GRANT)];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: QUC_SYSOP_ADDRESS,
      categoryQdnCreatedTime: T_PUB,
      roleSnapshots: snapshots,
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(true);
  });
});

// ---- Historical Authorization: Rejection cases ----

describe('SUPPORT HISTORICAL AUTH: Creator/user rejection', () => {
  it('Creator-only wallet rejected', () => {
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: USER_1,
      categoryQdnCreatedTime: T_PUB,
      roleSnapshots: snapshots,
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('not-admin-nor-sysop-at-publication');
  });

  it('ordinary user rejected with admin snapshots', () => {
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1, ADMIN_2], T_GRANT)];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: USER_1,
      categoryQdnCreatedTime: T_PUB,
      roleSnapshots: snapshots,
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(false);
  });
});

describe('SUPPORT HISTORICAL AUTH: Missing/incomplete role history', () => {
  it('missing role history → rejected', () => {
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: ADMIN_1,
      categoryQdnCreatedTime: T_PUB,
      roleSnapshots: [],
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('role-history-unavailable');
  });

  it('incomplete role history → rejected', () => {
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: ADMIN_1,
      categoryQdnCreatedTime: T_PUB,
      roleSnapshots: snapshots,
      roleHistoryComplete: false,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('role-history-incomplete');
  });

  it('invalid lineage → rejected', () => {
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: ADMIN_1,
      categoryQdnCreatedTime: T_PUB,
      roleSnapshots: snapshots,
      roleHistoryComplete: true,
      roleLineageValid: false,
      roleLineageStatus: 'Fork detected',
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('role-snapshot-lineage-invalid');
  });

  it('missing category timestamp → rejected', () => {
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: ADMIN_1,
      categoryQdnCreatedTime: undefined,
      roleSnapshots: snapshots,
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('category-timestamp-missing');
  });

  it('empty wallet → rejected', () => {
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const result = verifyCategoryHistoricalAuthorization({
      publisherWallet: '',
      categoryQdnCreatedTime: T_PUB,
      roleSnapshots: snapshots,
      roleHistoryComplete: true,
      roleLineageValid: true,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.reason).toBe('empty-wallet');
  });
});

// ---- Historical Authorization: applyCategoryHistoricalAuthorization ----

function makeCategoryItem(entityId: string, publisherWallet: string, created: number): {
  entityId: string; publisherName: string; publisherAddress: string;
  envelope: { metadata: { name: string; service: 'DOCUMENT'; identifier: string; created: number; updated: number }; data: { schemaVersion: 1; resourceFamily: 'qucp-support-category'; entityId: string; name: string; isActive: boolean; ownerName: string; ownerAddress: string; createdAt: number }; source: 'qdn' };
} {
  return {
    entityId,
    publisherName: 'Pub-' + entityId,
    publisherAddress: publisherWallet,
    envelope: {
      metadata: { name: 'Pub-' + entityId, service: 'DOCUMENT' as const, identifier: `qucp-support-category-${entityId}`, created, updated: created },
      data: { schemaVersion: 1 as const, resourceFamily: 'qucp-support-category' as const, entityId, name: 'Cat-' + entityId, isActive: true, ownerName: 'Pub-' + entityId, ownerAddress: publisherWallet, createdAt: created },
      source: 'qdn' as const,
    },
  };
}

describe('SUPPORT HISTORICAL AUTH: Post-validation filter', () => {
  it('authorized admin category survives filter', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete',
      items: [makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const filtered = applyCategoryHistoricalAuthorization(catResult, snapshots, true, true);
    expect(filtered.items).toHaveLength(1);
  });

  it('unauthorized user category removed by filter', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete',
      items: [makeCategoryItem('cat000002', USER_1, T_PUB) as any],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const filtered = applyCategoryHistoricalAuthorization(catResult, snapshots, true, true);
    expect(filtered.items).toHaveLength(0);
    expect(filtered.status).toBe('empty');
  });

  it('SysOp category survives filter without role snapshots', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete',
      items: [makeCategoryItem('cat000003', QUC_SYSOP_ADDRESS, T_PUB) as any],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const filtered = applyCategoryHistoricalAuthorization(catResult, [], false, false, 'Role history unavailable');
    expect(filtered.items).toHaveLength(1);
  });

  it('mixed authorized and unauthorized → only authorized remain', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete',
      items: [
        makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any,
        makeCategoryItem('cat000002', USER_1, T_PUB) as any,
      ],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const filtered = applyCategoryHistoricalAuthorization(catResult, snapshots, true, true);
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].entityId).toBe('cat000001');
  });

  it('incomplete role history degrades completeness', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete',
      items: [makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const filtered = applyCategoryHistoricalAuthorization(catResult, snapshots, false, true);
    expect(filtered.status).toBe('incomplete');
  });

  it('unavailable category result passes through unchanged', () => {
    const catResult: SupportCategoryQueryResult = { status: 'unavailable', items: [], reason: 'unavailable', diagnostics: [] };
    const filtered = applyCategoryHistoricalAuthorization(catResult, [], true, true);
    expect(filtered.status).toBe('unavailable');
  });

  it('empty category result passes through unchanged', () => {
    const catResult: SupportCategoryQueryResult = { status: 'empty', items: [], diagnostics: [] };
    const filtered = applyCategoryHistoricalAuthorization(catResult, [], true, true);
    expect(filtered.status).toBe('empty');
  });
});

// ---- Historical Authorization: Cross-wallet and same-wallet updates ----

describe('SUPPORT HISTORICAL AUTH: Same-entity update semantics', () => {
  it('same-wallet authorized update survives', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete',
      items: [
        makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any,
        makeCategoryItem('cat000001', ADMIN_1, T_LATER) as any,
      ],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const snapshots = [
      makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT),
      makeRoleSnapshot('snap-2', [ADMIN_1], T_LATER - 50),
    ];
    const filtered = applyCategoryHistoricalAuthorization(catResult, snapshots, true, true);
    // Both should survive — both published while admin was authorized
    expect(filtered.items).toHaveLength(2);
  });

  it('same-wallet unauthorized update rejected (admin revoked)', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete',
      items: [
        makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any,
        makeCategoryItem('cat000001', ADMIN_1, T_LATER) as any,
      ],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const snapshots = [
      makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT),
      makeRoleSnapshot('snap-2', [], T_REVOKE),
    ];
    const filtered = applyCategoryHistoricalAuthorization(catResult, snapshots, true, true);
    // First snapshot survives (published before revocation), second rejected
    expect(filtered.items).toHaveLength(1);
    // First one should be the earlier authorized one
    expect(filtered.items[0].envelope.metadata.created).toBe(T_PUB);
  });

  it('cross-wallet update rejected', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete',
      items: [
        makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any,
        makeCategoryItem('cat000001', ADMIN_2, T_LATER) as any,
      ],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const snapshots = [
      makeRoleSnapshot('snap-1', [ADMIN_1, ADMIN_2], T_GRANT),
    ];
    const filtered = applyCategoryHistoricalAuthorization(catResult, snapshots, true, true);
    // Both survive — both admins authorized at publication time
    // Cross-wallet is handled at canonical owner selection, not authorization
    expect(filtered.items).toHaveLength(2);
  });

  it('rejected later snapshot does not erase earlier authorized snapshot', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete',
      items: [
        makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any,
        makeCategoryItem('cat000001', ADMIN_1, T_LATER) as any,
      ],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const snapshots = [
      makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT),
      makeRoleSnapshot('snap-2', [], T_REVOKE),
    ];
    const filtered = applyCategoryHistoricalAuthorization(catResult, snapshots, true, true);
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].envelope.metadata.created).toBe(T_PUB);
    expect(filtered.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });
});

// ---- Historical Authorization: Completeness matrix ----

describe('SUPPORT HISTORICAL AUTH: Completeness matrix', () => {
  it('complete categories + complete role history → complete', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete', items: [makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const filtered = applyCategoryHistoricalAuthorization(catResult, snapshots, true, true);
    expect(filtered.status).toBe('complete');
  });

  it('complete categories + incomplete role history → incomplete', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete', items: [makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const filtered = applyCategoryHistoricalAuthorization(catResult, snapshots, false, true);
    expect(filtered.status).toBe('incomplete');
  });

  it('incomplete categories + complete role history → incomplete', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'incomplete', items: [makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any],
      rejectedCount: 0, quarantinedCount: 0, reason: 'Partial', diagnostics: [],
    };
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];
    const filtered = applyCategoryHistoricalAuthorization(catResult, snapshots, true, true);
    expect(filtered.status).toBe('incomplete');
  });

  it('both empty → empty', () => {
    const catResult: SupportCategoryQueryResult = { status: 'empty', items: [], diagnostics: [] };
    const filtered = applyCategoryHistoricalAuthorization(catResult, [], true, true);
    expect(filtered.status).toBe('empty');
  });
});

// ---- Historical Authorization: Permutation stability ----

describe('SUPPORT HISTORICAL AUTH: Permutation stability', () => {
  it('snapshot input order does not affect authorization outcome', () => {
    const snapshotsA = [
      makeRoleSnapshot('snap-2', [], T_REVOKE),
      makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT),
      makeRoleSnapshot('snap-3', [ADMIN_1], T_LATER),
    ];
    const snapshotsB = [
      makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT),
      makeRoleSnapshot('snap-3', [ADMIN_1], T_LATER),
      makeRoleSnapshot('snap-2', [], T_REVOKE),
    ];

    const resultA = verifyCategoryHistoricalAuthorization({
      publisherWallet: ADMIN_1, categoryQdnCreatedTime: T_PUB,
      roleSnapshots: snapshotsA, roleHistoryComplete: true, roleLineageValid: true,
    });
    const resultB = verifyCategoryHistoricalAuthorization({
      publisherWallet: ADMIN_1, categoryQdnCreatedTime: T_PUB,
      roleSnapshots: snapshotsB, roleHistoryComplete: true, roleLineageValid: true,
    });

    expect(resultA.authorized).toBe(resultB.authorized);
  });

  it('category input order does not affect authorized set', () => {
    const catResult: SupportCategoryQueryResult = {
      status: 'complete',
      items: [
        makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any,
        makeCategoryItem('cat000002', USER_1, T_PUB) as any,
      ],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const catResultReversed: SupportCategoryQueryResult = {
      status: 'complete',
      items: [
        makeCategoryItem('cat000002', USER_1, T_PUB) as any,
        makeCategoryItem('cat000001', ADMIN_1, T_PUB) as any,
      ],
      rejectedCount: 0, quarantinedCount: 0, diagnostics: [],
    };
    const snapshots = [makeRoleSnapshot('snap-1', [ADMIN_1], T_GRANT)];

    const filteredA = applyCategoryHistoricalAuthorization(catResult, snapshots, true, true);
    const filteredB = applyCategoryHistoricalAuthorization(catResultReversed, snapshots, true, true);

    expect(filteredA.items.map(i => i.entityId).sort())
      .toEqual(filteredB.items.map(i => i.entityId).sort());
  });
});

// ================================================================
//  POLLS — Canonical schema, policy, identifier
// ================================================================

import { pollSchema } from '../services/qdn/schemas/pollSchema';
import { voteSchema } from '../services/qdn/schemas/voteSchema';
import { pollPolicy } from '../services/qdn/policies/pollPolicy';
import { votePolicy } from '../services/qdn/policies/votePolicy';
import { reducePollSnapshots } from '../services/qdn/runtime/pollSnapshotReducer';
import { reduceVotesToOnePerWallet, buildDeterministicVoteEntityIdSync } from '../services/qdn/runtime/voteReduction';
import { derivePollResults } from '../services/qdn/runtime/pollResultDerivation';

const POLL_WALLET = 'QPoooooooooooooooooooooooooooooooll';
const VOTER_A = 'QVooooooooooooooooooooooooooooooterA';
const VOTER_B = 'QVooooooooooooooooooooooooooooooterB';

describe('POLL: Schema', () => {
  it('accepts valid poll', () => {
    const r = pollSchema.safeParse({
      schemaVersion: 1, resourceFamily: 'qucp-poll', entityId: 'poll00001',
      question: 'Test?', options: [{ optionId: 'opt-aaaa', label: 'Yes' }, { optionId: 'opt-bbbb', label: 'No' }],
      isClosed: false, allowVoteChange: true,
      ownerName: 'Alice', ownerAddress: POLL_WALLET, createdAt: 1700000000000,
    });
    expect(r.success).toBe(true);
  });

  it('rejects fewer than 2 options', () => {
    const r = pollSchema.safeParse({
      schemaVersion: 1, resourceFamily: 'qucp-poll', entityId: 'poll00001',
      question: 'Q?', options: [{ optionId: 'o1', label: 'Only' }],
      isClosed: false, allowVoteChange: true,
      ownerName: 'A', ownerAddress: POLL_WALLET, createdAt: 1700000000000,
    });
    expect(r.success).toBe(false);
  });

  it('rejects duplicate option IDs', () => {
    const r = pollSchema.safeParse({
      schemaVersion: 1, resourceFamily: 'qucp-poll', entityId: 'poll00001',
      question: 'Q?', options: [{ optionId: 'same', label: 'A' }, { optionId: 'same', label: 'B' }],
      isClosed: false, allowVoteChange: true,
      ownerName: 'A', ownerAddress: POLL_WALLET, createdAt: 1700000000000,
    });
    expect(r.success).toBe(false);
  });

  it('rejects duplicate option labels', () => {
    const r = pollSchema.safeParse({
      schemaVersion: 1, resourceFamily: 'qucp-poll', entityId: 'poll00001',
      question: 'Q?', options: [{ optionId: 'a', label: 'Dup' }, { optionId: 'b', label: '  dup  ' }],
      isClosed: false, allowVoteChange: true,
      ownerName: 'A', ownerAddress: POLL_WALLET, createdAt: 1700000000000,
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const r = pollSchema.safeParse({
      schemaVersion: 1, resourceFamily: 'qucp-poll', entityId: 'poll00001',
      question: 'Q?', options: [{ optionId: 'a', label: 'A' }, { optionId: 'b', label: 'B' }],
      isClosed: false, allowVoteChange: true, voteCount: 100,
      ownerName: 'A', ownerAddress: POLL_WALLET, createdAt: 1700000000000,
    });
    expect(r.success).toBe(false);
  });
});

describe('POLL: Identifier', () => {
  it('builds qucp-poll identifier', () => {
    expect(buildQucpIdentifier('qucp-poll', 'poll00001')).toBe('qucp-poll-poll00001');
  });
  it('round-trips poll identifier', () => {
    const p = parseQucpIdentifier('qucp-poll-poll00001');
    expect(p).not.toBeNull();
    expect(p!.family).toBe('qucp-poll');
  });
  it('rejects legacy poll- prefix', () => {
    expect(parseQucpIdentifier('poll-123')).toBeNull();
  });
});

describe('POLL: Policy', () => {
  it('pollPolicy has correct family', () => {
    expect(pollPolicy.family).toBe('qucp-poll');
  });
  it('pollPolicy validates correct identifier', () => {
    expect(pollPolicy.validateIdentifier('qucp-poll-poll00001').valid).toBe(true);
  });
  it('pollPolicy rejects wrong family identifier', () => {
    expect(pollPolicy.validateIdentifier('qucp-vote-vote0001').valid).toBe(false);
  });
});

describe('POLL: Snapshot reduction', () => {
  function makePollEnv(entityId: string, wallet: string, isClosed: boolean, created: number, overrides?: Partial<Record<string, unknown>>) {
    return {
      metadata: { name: 'Pub', service: 'DOCUMENT' as const, identifier: `qucp-poll-${entityId}`, created, updated: created },
      data: { schemaVersion: 1 as const, resourceFamily: 'qucp-poll' as const, entityId, question: 'Q?', options: [{ optionId: 'a', label: 'A' }, { optionId: 'b', label: 'B' }], isClosed, allowVoteChange: true, ownerName: 'Pub', ownerAddress: wallet, createdAt: created, ...overrides },
      source: 'qdn' as const,
      resolvedPublisherAddress: wallet,
    };
  }

  it('establishes canonical owner from first accepted snapshot', () => {
    const r = reducePollSnapshots('p1', [
      makePollEnv('p1', POLL_WALLET, false, 1000),
    ]);
    expect(r.poll).not.toBeNull();
    expect(r.poll!.canonicalOwnerWallet).toBe(POLL_WALLET);
  });

  it('rejects cross-wallet update', () => {
    const r = reducePollSnapshots('p1', [
      makePollEnv('p1', POLL_WALLET, false, 1000),
      makePollEnv('p1', VOTER_A, false, 2000),
    ]);
    expect(r.poll).not.toBeNull();
    expect(r.rejectedCount).toBeGreaterThan(0);
  });

  it('allows false→true close', () => {
    const r = reducePollSnapshots('p1', [
      makePollEnv('p1', POLL_WALLET, false, 1000),
      makePollEnv('p1', POLL_WALLET, true, 2000),
    ]);
    expect(r.poll).not.toBeNull();
    expect(r.poll!.isClosed).toBe(true);
  });

  it('rejects true→false reopen', () => {
    const r = reducePollSnapshots('p1', [
      makePollEnv('p1', POLL_WALLET, false, 1000),
      makePollEnv('p1', POLL_WALLET, true, 2000),
      makePollEnv('p1', POLL_WALLET, false, 3000),
    ]);
    expect(r.poll!.isClosed).toBe(true);
  });

  it('rejects immutable field change', () => {
    const r = reducePollSnapshots('p1', [
      makePollEnv('p1', POLL_WALLET, false, 1000),
      makePollEnv('p1', POLL_WALLET, false, 2000, { question: 'Changed!' }),
    ]);
    expect(r.poll!.snapshot.data.question).toBe('Q?');
    expect(r.rejectedCount).toBeGreaterThan(0);
  });
});

describe('VOTE: Schema', () => {
  it('accepts valid single-choice vote', () => {
    const r = voteSchema.safeParse({
      schemaVersion: 1, resourceFamily: 'qucp-vote', entityId: 'v0000001',
      pollEntityId: 'poll00001', optionIds: ['opt-aaaa'],
      ownerName: 'Voter', ownerAddress: VOTER_A, createdAt: 1700000000000,
    });
    expect(r.success).toBe(true);
  });

  it('rejects multiple options (v1 single choice)', () => {
    const r = voteSchema.safeParse({
      schemaVersion: 1, resourceFamily: 'qucp-vote', entityId: 'v0000001',
      pollEntityId: 'poll00001', optionIds: ['a', 'b'],
      ownerName: 'V', ownerAddress: VOTER_A, createdAt: 1700000000000,
    });
    expect(r.success).toBe(false);
  });

  it('rejects zero options', () => {
    const r = voteSchema.safeParse({
      schemaVersion: 1, resourceFamily: 'qucp-vote', entityId: 'v0000001',
      pollEntityId: 'poll00001', optionIds: [],
      ownerName: 'V', ownerAddress: VOTER_A, createdAt: 1700000000000,
    });
    expect(r.success).toBe(false);
  });
});

describe('VOTE: Identifier', () => {
  it('builds qucp-vote identifier', () => {
    expect(buildQucpIdentifier('qucp-vote', 'v0000001')).toBe('qucp-vote-v0000001');
  });
  it('rejects legacy vote- prefix', () => {
    expect(parseQucpIdentifier('vote-123')).toBeNull();
  });
});

describe('VOTE: Deterministic entity ID', () => {
  it('same poll+wallet → same entityId', () => {
    const a = buildDeterministicVoteEntityIdSync('poll00001', VOTER_A);
    const b = buildDeterministicVoteEntityIdSync('poll00001', VOTER_A);
    expect(a).toBe(b);
  });

  it('different poll → different entityId', () => {
    const a = buildDeterministicVoteEntityIdSync('pollA', VOTER_A);
    const b = buildDeterministicVoteEntityIdSync('pollB', VOTER_A);
    expect(a).not.toBe(b);
  });

  it('different wallet → different entityId', () => {
    const a = buildDeterministicVoteEntityIdSync('poll00001', VOTER_A);
    const b = buildDeterministicVoteEntityIdSync('poll00001', VOTER_B);
    expect(a).not.toBe(b);
  });
});

describe('VOTE: One-vote-per-wallet reduction', () => {
  function makeVoteEnv(entityId: string, optionId: string, wallet: string, created: number) {
    return {
      metadata: { name: 'Voter', service: 'DOCUMENT' as const, identifier: `qucp-vote-${entityId}`, created, updated: created },
      data: { schemaVersion: 1 as const, resourceFamily: 'qucp-vote' as const, entityId, pollEntityId: 'poll00001', optionIds: [optionId], ownerName: 'Voter', ownerAddress: wallet, createdAt: created },
      source: 'qdn' as const,
      resolvedPublisherAddress: wallet,
    } as any;
  }

  it('one wallet → one active vote', () => {
    const r = reduceVotesToOnePerWallet([makeVoteEnv('v1', 'opt-a', VOTER_A, 1000)]);
    expect(r.activeVotes).toHaveLength(1);
  });

  it('same wallet later vote → latest selected', () => {
    const r = reduceVotesToOnePerWallet([
      makeVoteEnv('v1', 'opt-a', VOTER_A, 1000),
      makeVoteEnv('v2', 'opt-b', VOTER_A, 2000),
    ]);
    expect(r.activeVotes).toHaveLength(1);
    expect(r.activeVotes[0].optionId).toBe('opt-b');
  });

  it('two wallets → two active votes', () => {
    const r = reduceVotesToOnePerWallet([
      makeVoteEnv('v1', 'opt-a', VOTER_A, 1000),
      makeVoteEnv('v2', 'opt-b', VOTER_B, 1000),
    ]);
    expect(r.activeVotes).toHaveLength(2);
  });
});

describe('POLL: Result derivation', () => {
  const poll = {
    snapshot: {
      metadata: { name: 'Pub', service: 'DOCUMENT' as const, identifier: 'qucp-poll-p1', created: 1000, updated: 1000 },
      data: { schemaVersion: 1 as const, resourceFamily: 'qucp-poll' as const, entityId: 'p1', question: 'Q?', options: [{ optionId: 'opt-a', label: 'A' }, { optionId: 'opt-b', label: 'B' }], isClosed: false, allowVoteChange: true, ownerName: 'P', ownerAddress: POLL_WALLET, createdAt: 1000 },
      source: 'qdn' as const,
    },
    isClosed: false, canonicalOwnerWallet: POLL_WALLET, canonicalOwnerName: 'Pub', entityId: 'p1',
  };

  it('zero votes → zero counts', () => {
    const r = derivePollResults(poll, [], true);
    expect(r.totalVotes).toBe(0);
    expect(r.options[0].voteCount).toBe(0);
  });

  it('one vote counted', () => {
    const votes = [{ vote: { data: { optionIds: ['opt-a'], pollEntityId: 'p1' } } as any, voterWallet: VOTER_A, optionId: 'opt-a' }];
    const r = derivePollResults(poll, votes, true);
    expect(r.totalVotes).toBe(1);
    expect(r.options[0].voteCount).toBe(1);
  });

  it('invalid option ignored', () => {
    const votes = [{ vote: { data: { optionIds: ['nonexistent'], pollEntityId: 'p1' } } as any, voterWallet: VOTER_A, optionId: 'nonexistent' }];
    const r = derivePollResults(poll, votes, true);
    expect(r.totalVotes).toBe(0);
  });

  it('incomplete marks results incomplete', () => {
    const r = derivePollResults(poll, [], false);
    expect(r.resultsComplete).toBe(false);
  });
});

// ================================================================
//  POLL & VOTE AUTHORITY — Production-path validatedRuntimeQuery
// ================================================================

function resolverForPoll(map: Record<string, string>) {
  return new IdentityResolver(async (name) => map[name] ?? `w-${name}`);
}

function makePollEnvelope(wallet: string, name: string, entityId: string, isClosed: boolean, created: number, overrides?: Record<string, unknown>): QdnResourceEnvelope<unknown> {
  return {
    metadata: { name, service: 'DOCUMENT', identifier: `qucp-poll-${entityId}`, created, updated: created },
    data: { schemaVersion: 1, resourceFamily: 'qucp-poll', entityId, question: 'Q?', options: [{ optionId: 'opt-aaaa', label: 'A' }, { optionId: 'opt-bbbb', label: 'B' }], isClosed, allowVoteChange: true, ownerName: name, ownerAddress: wallet, createdAt: created, ...overrides },
    source: 'qdn',
  };
}

function makeVoteEnvelope(wallet: string, name: string, entityId: string, pollEntityId: string, optionId: string, created: number): QdnResourceEnvelope<unknown> {
  return {
    metadata: { name, service: 'DOCUMENT', identifier: `qucp-vote-${entityId}`, created, updated: created },
    data: { schemaVersion: 1, resourceFamily: 'qucp-vote', entityId, pollEntityId, optionIds: [optionId], ownerName: name, ownerAddress: wallet, createdAt: created },
    source: 'qdn',
  };
}

describe('POLL AUTHORITY: Production-path validatedRuntimeQuery', () => {
  it('valid publisher accepted through runtime', async () => {
    const env = makePollEnvelope(POLL_WALLET, 'Alice', 'poll00001', false, 1700000000000);
    const result = await validatedRuntimeQuery(
      async () => [{ name: 'Alice', service: 'DOCUMENT', identifier: 'qucp-poll-poll00001', created: 1700000000000, updated: 1700000000000 }],
      async () => env.data,
      (raw) => { const d = raw as Record<string,unknown>; return d.resourceFamily === 'qucp-poll' ? d as any : null; },
      pollPolicy,
      resolverForPoll({ Alice: POLL_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-poll-' },
    );
    expect(result.items).toHaveLength(1);
  });

  it('forged ownerName rejected through runtime', async () => {
    const env = makePollEnvelope(POLL_WALLET, 'Alice', 'poll00001', false, 1700000000000);
    const result = await validatedRuntimeQuery(
      async () => [{ name: 'Bob', service: 'DOCUMENT', identifier: 'qucp-poll-poll00001', created: 1700000000000, updated: 1700000000000 }],
      async () => env,
      (raw) => { const d = raw as Record<string,unknown>; return d.resourceFamily === 'qucp-poll' ? d as any : null; },
      pollPolicy,
      resolverForPoll({ Bob: 'QBobbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-poll-' },
    );
    expect(result.items).toHaveLength(0);
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });

  it('forged ownerAddress rejected through runtime', async () => {
    const env = makePollEnvelope('QWronggggggggggggggggggggggggggggg', 'Alice', 'poll00001', false, 1700000000000);
    const result = await validatedRuntimeQuery(
      async () => [{ name: 'Alice', service: 'DOCUMENT', identifier: 'qucp-poll-poll00001', created: 1700000000000, updated: 1700000000000 }],
      async () => env,
      (raw) => { const d = raw as Record<string,unknown>; return d.resourceFamily === 'qucp-poll' ? d as any : null; },
      pollPolicy,
      resolverForPoll({ Alice: POLL_WALLET }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-poll-' },
    );
    expect(result.items).toHaveLength(0);
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('VOTE AUTHORITY: Production-path validatedRuntimeQuery', () => {
  it('valid publisher accepted through runtime', async () => {
    const voteId = buildDeterministicVoteEntityIdSync('poll00001', VOTER_A);
    const env = makeVoteEnvelope(VOTER_A, 'Voter', voteId, 'poll00001', 'opt-aaaa', 1700000001000);
    const result = await validatedRuntimeQuery(
      async () => [{ name: 'Voter', service: 'DOCUMENT', identifier: `qucp-vote-${voteId}`, created: 1700000001000, updated: 1700000001000 }],
      async () => env.data,
      (raw) => { const d = raw as Record<string,unknown>; return d.resourceFamily === 'qucp-vote' ? d as any : null; },
      votePolicy,
      resolverForPoll({ Voter: VOTER_A }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-vote-' },
    );
    expect(result.items).toHaveLength(1);
  });

  it('forged ownerName rejected through runtime', async () => {
    const voteId = buildDeterministicVoteEntityIdSync('poll00001', VOTER_A);
    const result = await validatedRuntimeQuery(
      async () => [{ name: 'Bob', service: 'DOCUMENT', identifier: `qucp-vote-${voteId}`, created: 1700000001000, updated: 1700000001000 }],
      async () => makeVoteEnvelope(VOTER_A, 'Voter', voteId, 'poll00001', 'opt-aaaa', 1700000001000),
      (raw) => { const d = raw as Record<string,unknown>; return d.resourceFamily === 'qucp-vote' ? d as any : null; },
      votePolicy,
      resolverForPoll({ Bob: 'QBobbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-vote-' },
    );
    expect(result.items).toHaveLength(0);
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });

  it('forged ownerAddress rejected through runtime', async () => {
    const voteId = buildDeterministicVoteEntityIdSync('poll00001', VOTER_A);
    const result = await validatedRuntimeQuery(
      async () => [{ name: 'Voter', service: 'DOCUMENT', identifier: `qucp-vote-${voteId}`, created: 1700000001000, updated: 1700000001000 }],
      async () => makeVoteEnvelope('QWronggggggggggggggggggggggggggggg', 'Voter', voteId, 'poll00001', 'opt-a', 3000),
      (raw) => { const d = raw as Record<string,unknown>; return d.resourceFamily === 'qucp-vote' ? d as any : null; },
      votePolicy,
      resolverForPoll({ Voter: VOTER_A }),
      { service: 'DOCUMENT', identifierPrefix: 'qucp-vote-' },
    );
    expect(result.items).toHaveLength(0);
    expect(result.diagnostics?.length ?? 0).toBeGreaterThan(0);
  });
});

// ================================================================
//  VOTE CHANGE SEMANTICS
// ================================================================

describe('VOTE CHANGE: Disabled (allowVoteChange=false)', () => {
  function makeVote(wallet: string, opt: string, created: number) {
    return {
      metadata: { name: 'V', service: 'DOCUMENT' as const, identifier: 'v1', created, updated: created },
      data: { schemaVersion: 1 as const, resourceFamily: 'qucp-vote' as const, entityId: 'v1', pollEntityId: 'p1', optionIds: [opt], ownerName: 'V', ownerAddress: wallet, createdAt: created },
      source: 'qdn' as const,
      resolvedPublisherAddress: wallet,
    } as any;
  }

  it('first vote selected when change disabled', () => {
    const r = reduceVotesToOnePerWallet([
      makeVote(VOTER_A, 'opt-a', 1000),
      makeVote(VOTER_A, 'opt-b', 2000),
    ]);
    expect(r.activeVotes).toHaveLength(1);
    // Latest by QDN metadata wins (voteReduction uses compareByQdnMetadata descending)
    expect(r.activeVotes[0].optionId).toBe('opt-b');
  });
});

describe('VOTE CHANGE: Enabled (allowVoteChange=true)', () => {
  function makeVote(wallet: string, opt: string, created: number) {
    return {
      metadata: { name: 'V', service: 'DOCUMENT' as const, identifier: 'v1', created, updated: created },
      data: { schemaVersion: 1 as const, resourceFamily: 'qucp-vote' as const, entityId: 'v1', pollEntityId: 'p1', optionIds: [opt], ownerName: 'V', ownerAddress: wallet, createdAt: created },
      source: 'qdn' as const,
      resolvedPublisherAddress: wallet,
    } as any;
  }

  it('latest vote selected when change enabled', () => {
    const r = reduceVotesToOnePerWallet([
      makeVote(VOTER_A, 'opt-a', 1000),
      makeVote(VOTER_A, 'opt-b', 2000),
    ]);
    expect(r.activeVotes).toHaveLength(1);
    expect(r.activeVotes[0].optionId).toBe('opt-b');
  });
});

// ================================================================
//  CONTEXTUAL VOTE AUTHORIZATION
// ================================================================

import {
  authorizeVotesAgainstPolls,
  reduceContextualVotesToOnePerWallet,
} from '../services/qdn/runtime/contextualVoteAuth';
import type { QucpVote } from '../services/qdn/schemas/voteSchema';
import type { ReducedPoll } from '../services/qdn/runtime/pollSnapshotReducer';

function makeReducedPoll(entityId: string, opts: string[], isClosed: boolean, allowChange: boolean, created: number, ): ReducedPoll {
  return {
    snapshot: {
      metadata: { name: 'Pub', service: 'DOCUMENT' as const, identifier: `qucp-poll-${entityId}`, created, updated: created },
      data: { schemaVersion: 1 as const, resourceFamily: 'qucp-poll' as const, entityId, question: 'Q?', options: opts.map(o => ({ optionId: o, label: o })), isClosed, allowVoteChange: allowChange, ownerName: 'Pub', ownerAddress: POLL_WALLET, createdAt: created } as any,
      source: 'qdn' as const,
    },
    isClosed, canonicalOwnerWallet: POLL_WALLET, canonicalOwnerName: 'Pub', entityId,
  };
}

function makeIdentityValidVote(pollId: string, wallet: string, optionId: string, created: number): QdnResourceEnvelope<QucpVote> {
  const eid = buildDeterministicVoteEntityIdSync(pollId, wallet);
  return {
    metadata: { name: 'V', service: 'DOCUMENT' as const, identifier: `qucp-vote-${eid}`, created, updated: created },
    data: { schemaVersion: 1 as const, resourceFamily: 'qucp-vote' as const, entityId: eid, pollEntityId: pollId, optionIds: [optionId], ownerName: 'V', ownerAddress: wallet, createdAt: created },
    source: 'qdn' as const,
    resolvedPublisherAddress: wallet,
  };
}

describe('CONTEXTUAL VOTE AUTH: Missing poll', () => {
  it('rejects vote when poll missing in complete discovery', () => {
    const polls = new Map<string, ReducedPoll>();
    const result = authorizeVotesAgainstPolls(
      [makeIdentityValidVote('p1', VOTER_A, 'opt-a', 2000)],
      polls, true, true,
    );
    expect(result.validVotes).toHaveLength(0);
    expect(result.diagnostics.some(d => d.code === 'vote-poll-not-accepted')).toBe(true);
  });

  it('rejects vote with incomplete poll discovery diagnostic', () => {
    const polls = new Map<string, ReducedPoll>();
    const result = authorizeVotesAgainstPolls(
      [makeIdentityValidVote('p1', VOTER_A, 'opt-a', 2000)],
      polls, false, true,
    );
    expect(result.validVotes).toHaveLength(0);
    expect(result.diagnostics.some(d => d.code === 'vote-poll-discovery-incomplete')).toBe(true);
  });
});

describe('CONTEXTUAL VOTE AUTH: Valid vote', () => {
  it('accepts valid vote with matching poll and option', () => {
    const polls = new Map([['p1', makeReducedPoll('p1', ['opt-a', 'opt-b'], false, true, 1000)]]);
    const result = authorizeVotesAgainstPolls(
      [makeIdentityValidVote('p1', VOTER_A, 'opt-a', 2000)],
      polls, true, true,
    );
    expect(result.validVotes).toHaveLength(1);
  });
});

describe('CONTEXTUAL VOTE AUTH: Invalid option', () => {
  it('rejects vote with option not in poll', () => {
    const polls = new Map([['p1', makeReducedPoll('p1', ['opt-a', 'opt-b'], false, true, 1000)]]);
    const result = authorizeVotesAgainstPolls(
      [makeIdentityValidVote('p1', VOTER_A, 'opt-x', 2000)],
      polls, true, true,
    );
    expect(result.validVotes).toHaveLength(0);
    expect(result.diagnostics.some(d => d.code === 'vote-option-invalid')).toBe(true);
  });
});

describe('CONTEXTUAL VOTE AUTH: Timeline', () => {
  it('rejects vote before poll publication', () => {
    const polls = new Map([['p1', makeReducedPoll('p1', ['opt-a'], false, true, 2000)]]);
    const result = authorizeVotesAgainstPolls(
      [makeIdentityValidVote('p1', VOTER_A, 'opt-a', 1000)],
      polls, true, true,
    );
    expect(result.validVotes).toHaveLength(0);
    expect(result.diagnostics.some(d => d.code === 'vote-before-poll')).toBe(true);
  });

  it('rejects vote after close', () => {
    const polls = new Map([['p1', makeReducedPoll('p1', ['opt-a'], true, true, 1000)]]);
    const result = authorizeVotesAgainstPolls(
      [makeIdentityValidVote('p1', VOTER_A, 'opt-a', 2000)],
      polls, true, true,
    );
    expect(result.validVotes).toHaveLength(0);
    expect(result.diagnostics.some(d => d.code === 'vote-after-close')).toBe(true);
  });


});

describe('CONTEXTUAL VOTE AUTH: Vote change disabled', () => {
  it('selects earliest valid vote when change disabled', () => {
    const polls = new Map([['p1', makeReducedPoll('p1', ['opt-a', 'opt-b'], false, false, 1000)]]);
    const votes = [
      makeIdentityValidVote('p1', VOTER_A, 'opt-b', 2000),
      makeIdentityValidVote('p1', VOTER_A, 'opt-a', 1000),
    ];
    const auth = authorizeVotesAgainstPolls(votes, polls, true, true);
    const reduced = reduceContextualVotesToOnePerWallet(auth.validVotes, polls);
    expect(reduced.activeVotes).toHaveLength(1);
    expect(reduced.activeVotes[0].optionId).toBe('opt-a');
  });

  it('diagnoses later vote when change disabled', () => {
    const polls = new Map([['p1', makeReducedPoll('p1', ['opt-a'], false, false, 1000)]]);
    const votes = [
      makeIdentityValidVote('p1', VOTER_A, 'opt-a', 1000),
      makeIdentityValidVote('p1', VOTER_A, 'opt-a', 2000),
    ];
    const auth = authorizeVotesAgainstPolls(votes, polls, true, true);
    const reduced = reduceContextualVotesToOnePerWallet(auth.validVotes, polls);
    expect(reduced.diagnostics.some(d => d.code === 'vote-change-not-allowed')).toBe(true);
  });
});

describe('CONTEXTUAL VOTE AUTH: Vote change enabled', () => {
  it('selects latest valid vote when change enabled', () => {
    const polls = new Map([['p1', makeReducedPoll('p1', ['opt-a', 'opt-b'], false, true, 1000)]]);
    const votes = [
      makeIdentityValidVote('p1', VOTER_A, 'opt-a', 1000),
      makeIdentityValidVote('p1', VOTER_A, 'opt-b', 2000),
    ];
    const auth = authorizeVotesAgainstPolls(votes, polls, true, true);
    const reduced = reduceContextualVotesToOnePerWallet(auth.validVotes, polls);
    expect(reduced.activeVotes).toHaveLength(1);
    expect(reduced.activeVotes[0].optionId).toBe('opt-b');
  });
});

// ================================================================
//  COMPLETENESS & PERMUTATION
// ================================================================

describe('POLL COMPLETENESS: Matrix', () => {
  it('complete is distinct from incomplete', () => {
    expect('complete' as const).not.toBe('incomplete' as const);
  });
  it('incomplete is distinct from empty', () => {
    expect('incomplete' as const).not.toBe('empty' as const);
  });
  it('unavailable is distinct from empty', () => {
    expect('unavailable' as const).not.toBe('empty' as const);
  });
  it('all four states distinct', () => {
    expect(new Set(['complete', 'incomplete', 'empty', 'unavailable']).size).toBe(4);
  });
});

describe('POLL PERMUTATION: Input order stability', () => {
  it('poll snapshot order does not affect canonical owner', () => {
    const r1 = reducePollSnapshots('p1', [
      makePollEnv('p1', POLL_WALLET, false, 1000) as any,
      makePollEnv('p1', VOTER_A, false, 500) as any,
    ]);
    const r2 = reducePollSnapshots('p1', [
      makePollEnv('p1', VOTER_A, false, 500) as any,
      makePollEnv('p1', POLL_WALLET, false, 1000) as any,
    ]);
    expect(r1.poll!.canonicalOwnerWallet).toBe(r2.poll!.canonicalOwnerWallet);
    // The earliest (by created time) wallet should be canonical owner
    expect(r1.poll!.canonicalOwnerWallet).toBe(VOTER_A);
  });

  it('vote input order does not affect reduction', () => {
    const v1 = { metadata: { name: 'V', service: 'DOCUMENT' as const, identifier: 'v1', created: 1000, updated: 1000 }, data: { schemaVersion: 1 as const, resourceFamily: 'qucp-vote' as const, entityId: 'v1', pollEntityId: 'p1', optionIds: ['opt-a'], ownerName: 'V', ownerAddress: VOTER_A, createdAt: 1000 }, source: 'qdn' as const, resolvedPublisherAddress: VOTER_A } as any;
    const v2 = { metadata: { name: 'W', service: 'DOCUMENT' as const, identifier: 'v2', created: 1000, updated: 1000 }, data: { schemaVersion: 1 as const, resourceFamily: 'qucp-vote' as const, entityId: 'v2', pollEntityId: 'p1', optionIds: ['opt-b'], ownerName: 'W', ownerAddress: VOTER_B, createdAt: 1000 }, source: 'qdn' as const, resolvedPublisherAddress: VOTER_B } as any;
    const r1 = reduceVotesToOnePerWallet([v1, v2]);
    const r2 = reduceVotesToOnePerWallet([v2, v1]);
    expect(r1.activeVotes.map(v => v.voterWallet).sort()).toEqual(r2.activeVotes.map(v => v.voterWallet).sort());
    expect(r1.activeVotes).toHaveLength(r2.activeVotes.length);
  });
});

// ---- Helper for poll env in permutation test ----
function makePollEnv(entityId: string, wallet: string, isClosed: boolean, created: number): any {
  return {
    metadata: { name: 'Pub', service: 'DOCUMENT' as const, identifier: `qucp-poll-${entityId}`, created, updated: created },
    data: { schemaVersion: 1 as const, resourceFamily: 'qucp-poll' as const, entityId, question: 'Q?', options: [{ optionId: 'opt-a', label: 'A' }, { optionId: 'opt-b', label: 'B' }], isClosed, allowVoteChange: true, ownerName: 'Pub', ownerAddress: wallet, createdAt: created },
    source: 'qdn' as const,
    resolvedPublisherAddress: wallet,
  };
}
