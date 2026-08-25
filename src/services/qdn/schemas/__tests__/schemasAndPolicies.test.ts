// ===== Schemas & Policies Tests =====

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  SCHEMA_VERSION,
  entityIdField,
  qdnNameField,
  walletAddressField,
  timestampField,
  titleField,
  slugField,
} from '../commonSchemas';
import { postSchema } from '../postSchema';
import { wikiArticleSchema } from '../wikiArticleSchema';
import { forumTopicSchema } from '../forumTopicSchema';
import { supportTicketSchema } from '../supportTicketSchema';
import {
  buildQucpIdentifier,
  parseQucpIdentifier,
  validateQucpIdentifier,
  extractEntityId,
  isQucpIdentifier,
  buildSearchPrefix,
} from '../../identifiers/qucpIdentifiers';
import {
  compareByQdnMetadata,
  selectLatestVersion,
  classifyEntity,
  validateImmutableFields,
} from '../../ordering/authoritativeEntityOrdering';
import { createResourceEnvelope } from '../../QdnResourceEnvelope';
import type { QdnResourceMetadata } from '../../QdnResourceEnvelope';

// ---- Helpers ----

function makeMeta(overrides?: Partial<QdnResourceMetadata>): QdnResourceMetadata {
  return {
    name: overrides?.name ?? 'Alice',
    service: 'DOCUMENT',
    identifier: overrides?.identifier ?? 'qucp-post-test1234',
    created: overrides?.created ?? 1700000000000,
    updated: overrides?.updated ?? 1700000001000,
  };
}

function makeEnvelope<T>(data: T, overrides?: Partial<QdnResourceMetadata>) {
  return createResourceEnvelope(makeMeta(overrides), data);
}

function validPostData(overrides?: Partial<{ entityId: string; ownerName: string; ownerAddress: string; createdAt: number }>) {
  return {
    schemaVersion: 1 as const,
    resourceFamily: 'qucp-post' as const,
    entityId: overrides?.entityId ?? 'test1234',
    ownerName: overrides?.ownerName ?? 'Alice',
    ownerAddress: overrides?.ownerAddress ?? 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
    createdAt: overrides?.createdAt ?? 1700000000000,
    title: 'Test Post Title',
    content: 'This is the content of the test post.',
  };
}

function validWikiData(overrides?: Partial<{ entityId: string; ownerName: string; ownerAddress: string; slug: string }>) {
  return {
    schemaVersion: 1 as const,
    resourceFamily: 'qucp-wiki' as const,
    entityId: overrides?.entityId ?? 'wiki1234',
    ownerName: overrides?.ownerName ?? 'Alice',
    ownerAddress: overrides?.ownerAddress ?? 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
    createdAt: 1700000000000,
    title: 'Test Wiki',
    slug: overrides?.slug ?? 'test-wiki',
    content: 'Wiki content here.',
    categoryId: 'getting-started',
    revision: 1,
    status: 'active' as const,
  };
}

function validForumData(overrides?: Partial<{ entityId: string; ownerName: string; ownerAddress: string }>) {
  return {
    schemaVersion: 1 as const,
    resourceFamily: 'qucp-forum-topic' as const,
    entityId: overrides?.entityId ?? 'topic001',
    ownerName: overrides?.ownerName ?? 'Alice',
    ownerAddress: overrides?.ownerAddress ?? 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
    createdAt: 1700000000000,
    title: 'Test Topic',
    content: 'Topic content.',
    categoryId: 'general',
  };
}

function validTicketData(overrides?: Partial<{ entityId: string; ownerName: string; ownerAddress: string }>) {
  return {
    schemaVersion: 1 as const,
    resourceFamily: 'qucp-support-ticket' as const,
    entityId: overrides?.entityId ?? 'ticket01',
    ownerName: overrides?.ownerName ?? 'Alice',
    ownerAddress: overrides?.ownerAddress ?? 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
    createdAt: 1700000000000,
    editedAt: 1700000000000,
    title: 'Test Ticket',
    description: 'Ticket description.',
    type: 'general' as const,
    userPriority: 'medium' as const,
    categoryId: 'category01',
  };
}

// ================================================================
//  Common Schemas
// ================================================================

describe('commonSchemas', () => {
  describe('schema version', () => {
    it('accepts version 1', () => {
      expect(() => z.literal(SCHEMA_VERSION).parse(1)).not.toThrow();
    });

    it('rejects unsupported schema version', () => {
      expect(() => z.literal(SCHEMA_VERSION).parse(2)).toThrow();
    });
  });

  describe('entityIdField', () => {
    it('accepts valid entity ID', () => {
      expect(entityIdField.parse('test1234')).toBe('test1234');
      expect(entityIdField.parse('my-post-id')).toBe('my-post-id');
    });

    it('rejects uppercase', () => {
      expect(() => entityIdField.parse('TestID')).toThrow();
    });

    it('rejects special characters', () => {
      expect(() => entityIdField.parse('test@id')).toThrow();
    });

    it('rejects too short', () => {
      expect(() => entityIdField.parse('abc')).toThrow();
    });

    it('rejects too long', () => {
      expect(() => entityIdField.parse('a'.repeat(65))).toThrow();
    });
  });

  describe('qdnNameField', () => {
    it('accepts valid QDN name', () => {
      expect(qdnNameField.parse('Alice')).toBe('Alice');
      expect(qdnNameField.parse('my_name')).toBe('my_name');
    });

    it('rejects empty name', () => {
      expect(() => qdnNameField.parse('')).toThrow();
    });

    it('rejects names with special chars', () => {
      expect(() => qdnNameField.parse('hello world')).toThrow();
    });
  });

  describe('walletAddressField', () => {
    it('accepts valid wallet address', () => {
      expect(walletAddressField.parse('QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm')).toBe('QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm');
    });

    it('rejects non-Q prefix', () => {
      expect(() => walletAddressField.parse('AWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm')).toThrow();
    });

    it('rejects too short', () => {
      expect(() => walletAddressField.parse('Qshort')).toThrow();
    });
  });

  describe('timestampField', () => {
    it('accepts valid timestamp', () => {
      expect(timestampField.parse(1700000000000)).toBe(1700000000000);
    });

    it('rejects far-future timestamp', () => {
      expect(() => timestampField.parse(9999999999999)).toThrow();
    });

    it('rejects year 2019 timestamp', () => {
      expect(() => timestampField.parse(1546300800000)).toThrow();
    });
  });

  describe('titleField', () => {
    it('accepts valid title', () => {
      expect(titleField.parse('Hello World')).toBe('Hello World');
    });

    it('rejects empty title', () => {
      expect(() => titleField.parse('')).toThrow();
    });

    it('rejects too long title', () => {
      expect(() => titleField.parse('x'.repeat(201))).toThrow();
    });
  });

  describe('slugField', () => {
    it('accepts valid slug', () => {
      expect(slugField.parse('my-test-slug')).toBe('my-test-slug');
    });

    it('rejects uppercase', () => {
      expect(() => slugField.parse('My-Slug')).toThrow();
    });

    it('rejects spaces', () => {
      expect(() => slugField.parse('my slug')).toThrow();
    });
  });
});

// ================================================================
//  Post Schema
// ================================================================

describe('postSchema', () => {
  it('accepts valid post', () => {
    const result = postSchema.safeParse(validPostData());
    expect(result.success).toBe(true);
  });

  it('rejects missing title', () => {
    const data = { ...validPostData(), title: undefined };
    expect(postSchema.safeParse(data).success).toBe(false);
  });

  it('rejects extra fields (strict parsing)', () => {
    const data = { ...validPostData(), reactionCount: 42, isPinned: true };
    const result = postSchema.safeParse(data);
    // .strict() rejects unknown keys — reactionCount and isPinned are not in the schema
    expect(result.success).toBe(false);
  });

  it('rejects unsupported schema version', () => {
    const data = { ...validPostData(), schemaVersion: 2 };
    expect(postSchema.safeParse(data).success).toBe(false);
  });

  it('rejects missing ownerName', () => {
    const data = { ...validPostData(), ownerName: undefined };
    expect(postSchema.safeParse(data).success).toBe(false);
  });
});

// ================================================================
//  Wiki Article Schema
// ================================================================

describe('wikiArticleSchema', () => {
  it('accepts valid wiki article', () => {
    const result = wikiArticleSchema.safeParse(validWikiData());
    expect(result.success).toBe(true);
  });

  it('rejects missing slug', () => {
    const data = { ...validWikiData(), slug: undefined };
    expect(wikiArticleSchema.safeParse(data).success).toBe(false);
  });

  it('rejects malformed slug', () => {
    const data = { ...validWikiData(), slug: 'INVALID SLUG!' };
    expect(wikiArticleSchema.safeParse(data).success).toBe(false);
  });
});

// ================================================================
//  Forum Topic Schema
// ================================================================

describe('forumTopicSchema', () => {
  it('accepts valid forum topic', () => {
    const result = forumTopicSchema.safeParse(validForumData());
    expect(result.success).toBe(true);
  });

  it('rejects missing categoryId', () => {
    const data = { ...validForumData(), categoryId: undefined };
    expect(forumTopicSchema.safeParse(data).success).toBe(false);
  });
});

// ================================================================
//  Support Ticket Schema
// ================================================================

describe('supportTicketSchema', () => {
  it('accepts valid support ticket', () => {
    const data = validTicketData();
    const result = supportTicketSchema.safeParse(data);
    if (!result.success) {
      console.error('Schema error:', JSON.stringify(result.error.issues, null, 2));
      console.error('Data:', JSON.stringify(data, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('rejects invalid ticket type', () => {
    const data = { ...validTicketData(), type: 'invalid-type' };
    expect(supportTicketSchema.safeParse(data).success).toBe(false);
  });

  it('rejects invalid userPriority', () => {
    const data = { ...validTicketData(), userPriority: 'critical' };
    expect(supportTicketSchema.safeParse(data).success).toBe(false);
  });
});

// ================================================================
//  Identifiers
// ================================================================

describe('qucpIdentifiers', () => {
  describe('buildQucpIdentifier', () => {
    it('builds post identifier', () => {
      expect(buildQucpIdentifier('qucp-post', 'test1234')).toBe('qucp-post-test1234');
    });

    it('builds wiki identifier', () => {
      expect(buildQucpIdentifier('qucp-wiki', 'wiki1234')).toBe('qucp-wiki-wiki1234');
    });

    it('builds forum-topic identifier', () => {
      expect(buildQucpIdentifier('qucp-forum-topic', 'topic001')).toBe('qucp-forum-topic-topic001');
    });

    it('builds support-ticket identifier', () => {
      expect(buildQucpIdentifier('qucp-support-ticket', 'ticket01')).toBe('qucp-support-ticket-ticket01');
    });

    it('throws on invalid entity ID', () => {
      expect(() => buildQucpIdentifier('qucp-post', 'INVALID')).toThrow();
    });
  });

  describe('parseQucpIdentifier', () => {
    it('parses post identifier', () => {
      const parsed = parseQucpIdentifier('qucp-post-test1234');
      expect(parsed).not.toBeNull();
      expect(parsed!.family).toBe('qucp-post');
      expect(parsed!.entityId).toBe('test1234');
    });

    it('parses wiki identifier', () => {
      const parsed = parseQucpIdentifier('qucp-wiki-wiki1234');
      expect(parsed!.family).toBe('qucp-wiki');
    });

    it('parses forum-topic identifier (two-word prefix)', () => {
      const parsed = parseQucpIdentifier('qucp-forum-topic-topic001');
      expect(parsed!.family).toBe('qucp-forum-topic');
      expect(parsed!.entityId).toBe('topic001');
    });

    it('parses support-ticket identifier (two-word prefix)', () => {
      const parsed = parseQucpIdentifier('qucp-support-ticket-ticket01');
      expect(parsed!.family).toBe('qucp-support-ticket');
    });

    it('returns null for non-qucp identifier', () => {
      expect(parseQucpIdentifier('post-1234')).toBeNull();
    });

    it('returns null for malformed identifier', () => {
      expect(parseQucpIdentifier('qucp-')).toBeNull();
    });

    it('returns null for wrong namespace', () => {
      expect(parseQucpIdentifier('qdn-v1-post-test')).toBeNull();
    });
  });

  describe('validateQucpIdentifier', () => {
    it('validates correct post identifier', () => {
      const result = validateQucpIdentifier('qucp-post-test1234', 'qucp-post');
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.entityId).toBe('test1234');
    });

    it('rejects wrong family', () => {
      const result = validateQucpIdentifier('qucp-post-test1234', 'qucp-wiki');
      expect(result.valid).toBe(false);
    });

    it('rejects malformed identifier', () => {
      const result = validateQucpIdentifier('bad-identifier', 'qucp-post');
      expect(result.valid).toBe(false);
    });
  });

  describe('extractEntityId', () => {
    it('extracts entity ID from valid identifier', () => {
      expect(extractEntityId('qucp-post-test1234')).toBe('test1234');
      expect(extractEntityId('qucp-forum-topic-topic001')).toBe('topic001');
    });

    it('returns null for invalid identifier', () => {
      expect(extractEntityId('bad')).toBeNull();
    });
  });

  describe('isQucpIdentifier', () => {
    it('returns true for qucp identifiers', () => {
      expect(isQucpIdentifier('qucp-post-test')).toBe(true);
    });

    it('returns false for non-qucp identifiers', () => {
      expect(isQucpIdentifier('post-123')).toBe(false);
    });
  });

  describe('legacy qucp-v1 rejection', () => {
    it('rejects qucp-v1-post identifier', () => {
      expect(parseQucpIdentifier('qucp-v1-post-test1234')).toBeNull();
    });
    it('rejects qucp-v1-wiki identifier', () => {
      expect(parseQucpIdentifier('qucp-v1-wiki-wiki1234')).toBeNull();
    });
    it('rejects qucp-v1-forum-topic identifier', () => {
      expect(parseQucpIdentifier('qucp-v1-forum-topic-topic001')).toBeNull();
    });
    it('rejects qucp-v1-support-ticket identifier', () => {
      expect(parseQucpIdentifier('qucp-v1-support-ticket-ticket01')).toBeNull();
    });
    it('rejects qucp-v1 identifier via isQucpIdentifier', () => {
      expect(isQucpIdentifier('qucp-v1-post-test')).toBe(false);
    });
    it('rejects qucp-v1 identifier via extractEntityId', () => {
      expect(extractEntityId('qucp-v1-post-test1234')).toBeNull();
    });
  });

  describe('buildSearchPrefix', () => {
    it('builds correct search prefix', () => {
      expect(buildSearchPrefix('qucp-post')).toBe('qucp-post-');
      expect(buildSearchPrefix('qucp-forum-topic')).toBe('qucp-forum-topic-');
    });
  });

  describe('forum topic identifiers', () => {
    it('builds qucp-forum-topic identifier', () => {
      expect(buildQucpIdentifier('qucp-forum-topic', 'topic001')).toBe('qucp-forum-topic-topic001');
    });
    it('round-trips forum topic identifier', () => {
      const parsed = parseQucpIdentifier('qucp-forum-topic-topic001');
      expect(parsed).not.toBeNull();
      expect(parsed!.family).toBe('qucp-forum-topic');
      expect(parsed!.entityId).toBe('topic001');
    });
  });

  describe('forum reply identifiers', () => {
    it('builds qucp-forum-reply identifier', () => {
      expect(buildQucpIdentifier('qucp-forum-reply', 'reply01')).toBe('qucp-forum-reply-reply01');
    });
    it('round-trips forum reply identifier', () => {
      const parsed = parseQucpIdentifier('qucp-forum-reply-reply01');
      expect(parsed).not.toBeNull();
      expect(parsed!.family).toBe('qucp-forum-reply');
      expect(parsed!.entityId).toBe('reply01');
    });
    it('rejects legacy forum-reply- identifier', () => {
      expect(parseQucpIdentifier('forum-reply-reply01')).toBeNull();
    });
    it('rejects legacy forum-thread- identifier', () => {
      expect(parseQucpIdentifier('forum-thread-thread01')).toBeNull();
    });
  });
});

// ================================================================
//  Ordering
// ================================================================

describe('authoritativeEntityOrdering', () => {
  describe('compareByQdnMetadata', () => {
    it('prefers newer updated timestamp', () => {
      const a = makeEnvelope({}, { updated: 200 });
      const b = makeEnvelope({}, { updated: 100 });
      expect(compareByQdnMetadata(a, b)).toBeLessThan(0); // a is newer → preferred
    });

    it('falls back to created timestamp when updated is equal', () => {
      const a = makeEnvelope({}, { updated: 100, created: 200 });
      const b = makeEnvelope({}, { updated: 100, created: 100 });
      expect(compareByQdnMetadata(a, b)).toBeLessThan(0);
    });

    it('falls back to publisher name when timestamps equal', () => {
      const a = makeEnvelope({}, { name: 'Alice', updated: 100, created: 100 });
      const b = makeEnvelope({}, { name: 'Bob', updated: 100, created: 100 });
      expect(compareByQdnMetadata(a, b)).toBeLessThan(0); // 'Alice' < 'Bob'
    });

    it('falls back to identifier when all else equal', () => {
      const a = makeEnvelope({}, { identifier: 'qucp-post-a', updated: 100, created: 100 });
      const b = makeEnvelope({}, { identifier: 'qucp-post-b', updated: 100, created: 100 });
      expect(compareByQdnMetadata(a, b)).toBeLessThan(0);
    });
  });

  describe('selectLatestVersion', () => {
    it('returns the most recent by metadata', () => {
      const envelopes = [
        makeEnvelope({}, { updated: 100 }),
        makeEnvelope({}, { updated: 300 }),
        makeEnvelope({}, { updated: 200 }),
      ];
      const latest = selectLatestVersion(envelopes);
      expect(latest).not.toBeNull();
      expect(latest!.metadata.updated).toBe(300);
    });

    it('returns null for empty array', () => {
      expect(selectLatestVersion([])).toBeNull();
    });
  });

  describe('classifyEntity', () => {
    it('classifies as creation when no existing envelopes', () => {
      const env = makeEnvelope({});
      const result = classifyEntity(env, []);
      expect(result.isCreation).toBe(true);
      expect(result.isUpdate).toBe(false);
    });

    it('classifies as update when same publisher exists', () => {
      const creation = makeEnvelope(
        {},
        { name: 'Alice', created: 100 },
      );
      creation.resolvedPublisherAddress = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

      const update = makeEnvelope(
        {},
        { name: 'Alice', created: 200 },
      );
      update.resolvedPublisherAddress = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

      const result = classifyEntity(update, [creation]);
      expect(result.isCreation).toBe(false);
      expect(result.isUpdate).toBe(true);
    });

    it('classifies as creation when different publisher', () => {
      const creation = makeEnvelope(
        {},
        { name: 'Alice', created: 100 },
      );
      creation.resolvedPublisherAddress = 'QAaa';

      const foreign = makeEnvelope(
        {},
        { name: 'Bob', created: 200 },
      );
      foreign.resolvedPublisherAddress = 'QBbb';

      const result = classifyEntity(foreign, [creation]);
      expect(result.isCreation).toBe(false);
      expect(result.isUpdate).toBe(false);
    });
  });

  describe('validateImmutableFields', () => {
    it('accepts unchanged immutable fields', () => {
      const result = validateImmutableFields(
        { entityId: 'x', ownerName: 'Alice' },
        { entityId: 'x', ownerName: 'Alice', title: 'New' },
        ['entityId', 'ownerName'],
      );
      expect(result.valid).toBe(true);
    });

    it('rejects changed entityId', () => {
      const result = validateImmutableFields(
        { entityId: 'x', ownerName: 'Alice' },
        { entityId: 'y', ownerName: 'Alice' },
        ['entityId', 'ownerName'],
      );
      expect(result.valid).toBe(false);
      expect(result.changedFields).toContain('entityId');
    });

    it('rejects changed ownerName', () => {
      const result = validateImmutableFields(
        { entityId: 'x', ownerName: 'Alice' },
        { entityId: 'x', ownerName: 'Bob' },
        ['entityId', 'ownerName'],
      );
      expect(result.valid).toBe(false);
      expect(result.changedFields).toContain('ownerName');
    });
  });
});
