// ===== QDN Test Fixtures =====
//
// These fixtures represent QDN resource states for use in tests.
// They are NOT production data — purely test artifacts.
// Placed under src/test/fixtures/ following project convention.

import type { RoleRegistry, UserRole } from '../../types';

// ---- Resource Metadata (search result shapes) ----

export interface QdnSearchResult {
  name: string;
  service: string;
  identifier: string;
  size?: number;
  created?: number;
  updated?: number;
}

export const validSearchResult: QdnSearchResult = {
  name: 'Alice',
  service: 'DOCUMENT',
  identifier: 'post-1234567890',
  size: 1024,
  created: 1700000000000,
  updated: 1700000001000,
};

export const searchResultMissingName: QdnSearchResult = {
  name: '',
  service: 'DOCUMENT',
  identifier: 'post-1234567890',
};

export const searchResultUnresolvedPublisher: QdnSearchResult = {
  name: 'unresolvable-name',
  service: 'DOCUMENT',
  identifier: 'post-1234567890',
};

// ---- Publisher Identity Fixtures ----

export const validPublisherIdentity = {
  qdnName: 'Alice',
  resolvedWallet: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  embeddedAuthorName: 'Alice',
  embeddedAuthorAddress: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

export const embeddedAuthorMismatch = {
  qdnName: 'Alice',
  resolvedWallet: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  embeddedAuthorName: 'Bob',
  embeddedAuthorAddress: 'QBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
};

export const embeddedWalletMismatch = {
  qdnName: 'Alice',
  resolvedWallet: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  embeddedAuthorName: 'Alice',
  embeddedAuthorAddress: 'QCcccccccccccccccccccccccccccccccccccccc',
};

// ---- Duplicate Entity Fixtures ----

export const sameEntityDifferentPublishers = [
  {
    name: 'Alice',
    identifier: 'post-1234567890',
    data: { id: '1234567890', title: 'Alice Original', authorName: 'Alice', authorAddress: 'QAaaaa' },
  },
  {
    name: 'Mallory',
    identifier: 'post-1234567890',
    data: { id: '1234567890', title: 'Mallory Forged', authorName: 'Alice', authorAddress: 'QAaaaa' },
  },
];

// ---- Timestamp Fixtures ----

export const farFutureTimestamp = {
  createdAt: '9999-12-31T23:59:59.999Z',
  updatedAt: 9999999999999,
};

export const normalTimestamp = {
  createdAt: '2026-07-25T12:00:00.000Z',
  updatedAt: 1753444800000,
};

// ---- Malformed JSON Fixtures ----

export const malformedJsonResponses = {
  incompleteJson: '{ "id": "test", "title": ',
  plainString: 'not json at all',
  nullResponse: null,
  undefinedResponse: undefined,
  emptyString: '',
  arrayInsteadOfObject: '[1, 2, 3]',
  deeplyNestedUnparseable: '{ "a": { "b": { "c": invalid } } }',
};

// ---- Schema Fixtures ----

export const invalidSchemaVersion = {
  version: 999,
  type: 'unknown-type',
  data: {},
};

export const validPostSchema = {
  id: 'post-1234567890',
  title: 'Test Post',
  content: 'Test content',
  authorName: 'Alice',
  authorAddress: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  createdAt: '2026-07-25T12:00:00.000Z',
  commentsCount: 0,
  likesCount: 0,
  isPinned: false,
  status: 'active' as const,
};

// ---- Role Registry Fixtures ----

export const trustedSysOpRegistry: RoleRegistry = {
  primarySysOpAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
  sysOps: [],
  admins: ['QN3XYzAbCdEfGhIjKlMnOpQrStUvWxYz'],
  moderators: ['QN7ModSquadLeaderXyzAbc123'],
  creators: ['QN2ABcdEfghIjklMnOpQrStUvWxYz1234'],
  updatedAt: 1753444800000,
};

export const untrustedRoleRegistry: RoleRegistry = {
  primarySysOpAddress: 'QMalloryMalloryMalloryMalloryMallory',
  sysOps: ['QMalloryMalloryMalloryMalloryMallory'],
  admins: ['QAttackerAttackerAttackerAttackerA'],
  moderators: [],
  creators: [],
  updatedAt: 9999999999999,
};

// ---- Entity Update Fixtures ----

export const ownerAuthoredUpdate = {
  publisherName: 'Alice',
  entityId: 'post-1234567890',
  originalOwner: 'Alice',
  embeddedAuthorName: 'Alice',
  embeddedAuthorAddress: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

export const foreignPublisherUpdate = {
  publisherName: 'Mallory',
  entityId: 'post-1234567890',
  originalOwner: 'Alice',
  embeddedAuthorName: 'Alice',
  embeddedAuthorAddress: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

// ---- Tombstone Fixtures ----

export const validOwnerTombstone = {
  publisherName: 'Alice',
  entityId: 'post-1234567890',
  entityOwner: 'Alice',
  status: 'deleted',
  deletedAt: '2026-07-25T12:00:00.000Z',
};

export const unauthorizedTombstone = {
  publisherName: 'Mallory',
  entityId: 'post-1234567890',
  entityOwner: 'Alice',
  status: 'deleted',
  deletedAt: '2026-07-25T12:00:00.000Z',
};

// ---- Moderation Operation Fixtures ----

export const validModerationOperation = {
  schemaVersion: 1,
  operationId: 'mod-1234567890-abc123',
  targetEntityType: 'post',
  targetEntityId: 'post-1234567890',
  action: 'hide' as const,
  actorName: 'ModMark',
  actorWallet: 'QN7ModSquadLeaderXyzAbc123',
  createdAt: '2026-07-25T12:00:00.000Z',
  reason: 'Off-topic content',
};

export const unauthorizedModerationOperation = {
  ...validModerationOperation,
  actorName: 'Mallory',
  actorWallet: 'QMalloryMalloryMalloryMalloryMallory',
  action: 'hide' as const,
};

// ---- Bridge-Unavailable Fixtures ----

export const bridgeUnavailableScenarios = {
  noWindowQdnRequest: {
    description: 'Browser environment with no injected bridge',
    setup: () => {
      // Simulate: window.qdnRequest is undefined, globalThis.qdnRequest is undefined
    },
    expectedBehavior: 'Returns null from getRequestBridge, requestQortium throws typed error',
  },
  crossOriginParent: {
    description: 'Q-App in iframe with cross-origin parent',
    setup: () => {
      // Simulate: window.qdnRequest exists but parent.qdnRequest throws cross-origin error
    },
    expectedBehavior: 'Catches cross-origin error, continues to check other sources',
  },
};

// ---- User Role Fixtures ----

export const roleTestAddresses: Record<UserRole, string> = {
  SysOp: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
  SuperAdmin: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
  Admin: 'QN3XYzAbCdEfGhIjKlMnOpQrStUvWxYz',
  Moderator: 'QN7ModSquadLeaderXyzAbc123',
  Creator: 'QN2ABcdEfghIjklMnOpQrStUvWxYz1234',
  Member: 'QUnknownUnknownUnknownUnknownUnkn',
};
