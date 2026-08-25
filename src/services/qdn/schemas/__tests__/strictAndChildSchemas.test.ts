// ===== Strict Schemas & Child Entity Tests =====

import { describe, it, expect } from 'vitest';
import {
  postSchema,
  wikiArticleSchema,
  forumTopicSchema,
  supportTicketSchema,
  postCommentSchema,
  forumReplySchema,
  ticketReplySchema,
  POST_COMMENT_IMMUTABLE_FIELDS,
  FORUM_REPLY_IMMUTABLE_FIELDS,
  TICKET_REPLY_IMMUTABLE_FIELDS,
} from '../index';
import {
  buildChildIdentifier,
  validateChildIdentifier,
} from '../../identifiers/qucpIdentifiers';
import {
  validateImmutableFields,
} from '../../ordering/authoritativeEntityOrdering';
import {
  classifyOrphan,
  validateParentReference,
  validateReplyChain,
} from '../../ordering/parentReference';

// ---- Helpers ----

// ---- Core entity factory helpers ----

const validPost = () => ({
  schemaVersion: 1 as const, resourceFamily: 'qucp-post' as const,
  entityId: 'test1234', ownerName: 'Alice',
  ownerAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
  createdAt: 1700000000000, title: 'Test', content: 'Content.',
});

const validWiki = () => ({
  schemaVersion: 1 as const, resourceFamily: 'qucp-wiki' as const,
  entityId: 'wiki1234', ownerName: 'Alice',
  ownerAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
  createdAt: 1700000000000, title: 'Wiki', slug: 'my-wiki',
  content: 'Content.', categoryId: 'general',
  revision: 1, status: 'active' as const,
});

const validForum = () => ({
  schemaVersion: 1 as const, resourceFamily: 'qucp-forum-topic' as const,
  entityId: 'topic001', ownerName: 'Alice',
  ownerAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
  createdAt: 1700000000000, title: 'Topic', content: 'Content.', categoryId: 'general',
});

const validTicket = () => ({
  schemaVersion: 1 as const, resourceFamily: 'qucp-support-ticket' as const,
  entityId: 'ticket01', ownerName: 'Alice',
  ownerAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
  createdAt: 1700000000000, title: 'Ticket', description: 'Desc.',
  type: 'general' as const, userPriority: 'medium' as const,
});

// ---- Child entity factory helpers ----

const validComment = () => ({
  schemaVersion: 1 as const, resourceFamily: 'qucp-post-comment' as const,
  entityId: 'comment01', parentEntityId: 'post1234',
  ownerName: 'Alice', ownerAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
  createdAt: 1700000000000, content: 'Great post!',
});

const validForumReply = () => ({
  schemaVersion: 1 as const, resourceFamily: 'qucp-forum-reply' as const,
  entityId: 'reply0001', parentEntityId: 'topic001',
  ownerName: 'Alice', ownerAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
  createdAt: 1700000000000, content: 'I agree.',
});

const validTicketReply = () => ({
  schemaVersion: 1 as const, resourceFamily: 'qucp-ticket-reply' as const,
  entityId: 'resp00001', parentEntityId: 'ticket01',
  ownerName: 'Alice', ownerAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
  createdAt: 1700000000000, content: 'Looking into this.',
});

// ================================================================
//  STRICT SCHEMA ENFORCEMENT
// ================================================================

describe('strict schema enforcement', () => {
  describe('post', () => {
    it('rejects unknown field', () => {
      const result = postSchema.safeParse({ ...validPost(), isPinned: true });
      expect(result.success).toBe(false);
    });

    it('rejects authority-looking field: moderatedBy', () => {
      const result = postSchema.safeParse({ ...validPost(), moderatedBy: 'Admin' });
      expect(result.success).toBe(false);
    });

    it('rejects aggregate field: reactionCount', () => {
      const result = postSchema.safeParse({ ...validPost(), reactionCount: 42 });
      expect(result.success).toBe(false);
    });

    it('rejects aggregate field: commentCount', () => {
      const result = postSchema.safeParse({ ...validPost(), commentCount: 10 });
      expect(result.success).toBe(false);
    });

    it('rejects moderation field: isHidden', () => {
      const result = postSchema.safeParse({ ...validPost(), isHidden: false });
      expect(result.success).toBe(false);
    });
  });

  describe('wiki article', () => {
    it('rejects unknown field', () => {
      const result = wikiArticleSchema.safeParse({ ...validWiki(), unknownField: 'x' });
      expect(result.success).toBe(false);
    });
  });

  describe('forum topic', () => {
    it('rejects moderation field: isPinned', () => {
      const result = forumTopicSchema.safeParse({ ...validForum(), isPinned: true });
      expect(result.success).toBe(false);
    });

    it('rejects moderation field: isLocked', () => {
      const result = forumTopicSchema.safeParse({ ...validForum(), isLocked: false });
      expect(result.success).toBe(false);
    });

    it('rejects aggregate field: replyCount', () => {
      const result = forumTopicSchema.safeParse({ ...validForum(), replyCount: 5 });
      expect(result.success).toBe(false);
    });
  });

  describe('support ticket', () => {
    it('rejects staff field: status', () => {
      const result = supportTicketSchema.safeParse({ ...validTicket(), status: 'closed' });
      expect(result.success).toBe(false);
    });

    it('rejects staff field: assignedTo', () => {
      const result = supportTicketSchema.safeParse({ ...validTicket(), assignedTo: 'StaffName' });
      expect(result.success).toBe(false);
    });
  });

  describe('post comment', () => {
    it('rejects unknown field', () => {
      const result = postCommentSchema.safeParse({ ...validComment(), reactionCount: 5 });
      expect(result.success).toBe(false);
    });

    it('rejects moderation field: isHidden', () => {
      const result = postCommentSchema.safeParse({ ...validComment(), isHidden: true });
      expect(result.success).toBe(false);
    });
  });

  describe('forum reply', () => {
    it('rejects unknown field', () => {
      const result = forumReplySchema.safeParse({ ...validForumReply(), likes: 10 });
      expect(result.success).toBe(false);
    });
  });

  describe('ticket reply', () => {
    it('rejects staff field: isOfficial', () => {
      const result = ticketReplySchema.safeParse({ ...validTicketReply(), isOfficial: true });
      expect(result.success).toBe(false);
    });
  });
});

// ================================================================
//  CHILD ENTITY SCHEMAS
// ================================================================

describe('child entity schemas', () => {
  it('accepts valid post comment', () => {
    expect(postCommentSchema.safeParse(validComment()).success).toBe(true);
  });

  it('accepts valid forum reply', () => {
    expect(forumReplySchema.safeParse(validForumReply()).success).toBe(true);
  });

  it('accepts valid ticket reply', () => {
    expect(ticketReplySchema.safeParse(validTicketReply()).success).toBe(true);
  });

  it('accepts forum reply with parentReplyId', () => {
    const data = { ...validForumReply(), parentReplyId: 'reply0000' };
    expect(forumReplySchema.safeParse(data).success).toBe(true);
  });

  it('rejects comment with missing parentEntityId', () => {
    const data = validComment();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { parentEntityId, ...rest } = data;
    expect(postCommentSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects reply with missing content', () => {
    const data = validForumReply();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { content, ...rest } = data;
    expect(forumReplySchema.safeParse(rest).success).toBe(false);
  });
});

// ================================================================
//  IMMUTABLE FIELDS — CHILD ENTITIES
// ================================================================

describe('immutable fields — child entities', () => {
  it('accepts same-owner update with unchanged immutable fields', () => {
    const creation = validComment();
    const update = { ...creation, content: 'Updated content.', editedAt: 1700000002000 };
    const result = validateImmutableFields(creation, update, POST_COMMENT_IMMUTABLE_FIELDS);
    expect(result.valid).toBe(true);
  });

  it('rejects changed ownerName', () => {
    const creation = validComment();
    const update = { ...creation, ownerName: 'Bob' };
    const result = validateImmutableFields(creation, update, POST_COMMENT_IMMUTABLE_FIELDS);
    expect(result.valid).toBe(false);
    expect(result.changedFields).toContain('ownerName');
  });

  it('rejects changed parentEntityId', () => {
    const creation = validComment();
    const update = { ...creation, parentEntityId: 'otherpost' };
    const result = validateImmutableFields(creation, update, POST_COMMENT_IMMUTABLE_FIELDS);
    expect(result.valid).toBe(false);
    expect(result.changedFields).toContain('parentEntityId');
  });

  it('rejects changed parentReplyId in forum reply (now immutable)', () => {
    const creation = validForumReply();
    const update = { ...creation, parentReplyId: 'otherreply' };
    const result = validateImmutableFields(creation, update, FORUM_REPLY_IMMUTABLE_FIELDS);
    expect(result.valid).toBe(false);
    expect(result.changedFields).toContain('parentReplyId');
  });

  it('rejects adding parentReplyId to top-level reply', () => {
    const creation = validForumReply(); // no parentReplyId
    const update = { ...creation, parentReplyId: 'reply0001' };
    // parentReplyId is immutable: adding it is a change from undefined to a value
    const result = validateImmutableFields(creation, update, FORUM_REPLY_IMMUTABLE_FIELDS);
    expect(result.valid).toBe(false);
  });

  it('rejects removing parentReplyId from nested reply', () => {
    const creation = { ...validForumReply(), parentReplyId: 'reply0000' } as const;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { parentReplyId, ...rest } = creation;
    const result = validateImmutableFields(creation, rest, FORUM_REPLY_IMMUTABLE_FIELDS);
    expect(result.valid).toBe(false);
  });

  it('rejects changed entityId in forum reply', () => {
    const creation = validForumReply();
    const update = { ...creation, entityId: 'different' };
    const result = validateImmutableFields(creation, update, FORUM_REPLY_IMMUTABLE_FIELDS);
    expect(result.valid).toBe(false);
  });

  it('rejects changed ownerAddress in ticket reply', () => {
    const creation = validTicketReply();
    const update = { ...creation, ownerAddress: 'QDifferentDifferentDifferentDifferent' };
    const result = validateImmutableFields(creation, update, TICKET_REPLY_IMMUTABLE_FIELDS);
    expect(result.valid).toBe(false);
  });
});

// ================================================================
//  CHILD IDENTIFIERS (no parent in identifier)
// ================================================================

describe('child identifiers', () => {
  describe('buildChildIdentifier', () => {
    it('builds post comment identifier (entityId only)', () => {
      const id = buildChildIdentifier('qucp-post-comment', 'comment01');
      expect(id).toBe('qucp-post-comment-comment01');
    });

    it('builds forum reply identifier', () => {
      const id = buildChildIdentifier('qucp-forum-reply', 'reply0001');
      expect(id).toBe('qucp-forum-reply-reply0001');
    });

    it('builds ticket reply identifier', () => {
      const id = buildChildIdentifier('qucp-ticket-reply', 'resp00001');
      expect(id).toBe('qucp-ticket-reply-resp00001');
    });

    it('handles hyphenated entity IDs', () => {
      const id = buildChildIdentifier('qucp-post-comment', 'my-comment-id');
      expect(id).toBe('qucp-post-comment-my-comment-id');
    });

    it('throws on invalid entity ID', () => {
      expect(() => buildChildIdentifier('qucp-post-comment', 'INVALID')).toThrow();
    });
  });

  describe('validateChildIdentifier', () => {
    it('validates correct identifier', () => {
      const result = validateChildIdentifier('qucp-post-comment-comment01', 'qucp-post-comment');
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.entityId).toBe('comment01');
    });

    it('round-trips hyphenated entity IDs', () => {
      const built = buildChildIdentifier('qucp-post-comment', 'my-comment-id');
      const result = validateChildIdentifier(built, 'qucp-post-comment');
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.entityId).toBe('my-comment-id');
    });

    it('rejects wrong family', () => {
      const result = validateChildIdentifier('qucp-post-comment-comment01', 'qucp-forum-reply');
      expect(result.valid).toBe(false);
    });

    it('rejects malformed identifier', () => {
      const result = validateChildIdentifier('bad-id', 'qucp-post-comment');
      expect(result.valid).toBe(false);
    });

    it('does NOT return parentEntityId', () => {
      // Parent is in the payload, not the identifier
      const result = validateChildIdentifier('qucp-post-comment-comment01', 'qucp-post-comment');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect((result as Record<string, unknown>).parentEntityId).toBeUndefined();
      }
    });
  });
});

// ================================================================
//  PARENT REFERENCE (2-arg, no identifier-parent matching)
// ================================================================

describe('parentReference', () => {
  it('accepts valid parent reference', () => {
    const result = validateParentReference('post1234', 'comment01');
    expect(result.valid).toBe(true);
  });

  it('rejects empty parent ID', () => {
    const result = validateParentReference('', 'comment01');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('empty');
  });

  it('rejects self-referencing parent', () => {
    const result = validateParentReference('same', 'same');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('same');
  });
});

describe('orphan classification', () => {
  const acceptedParents = [
    { entityId: 'post1234', resourceFamily: 'qucp-post', status: 'accepted' as const },
    { entityId: 'unavailable', resourceFamily: 'qucp-post', status: 'unavailable' as const },
    { entityId: 'rejected', resourceFamily: 'qucp-post', status: 'rejected' as const },
    { entityId: 'wrongfam', resourceFamily: 'qucp-wiki', status: 'accepted' as const },
  ];

  it('classifies linked when parent is accepted', () => {
    const result = classifyOrphan('child-1', 'post1234', 'qucp-post', acceptedParents);
    expect(result.status).toBe('linked');
  });

  it('classifies parent-unavailable', () => {
    const result = classifyOrphan('child-2', 'unavailable', 'qucp-post', acceptedParents);
    expect(result.status).toBe('parent-unavailable');
  });

  it('classifies parent-rejected', () => {
    const result = classifyOrphan('child-3', 'rejected', 'qucp-post', acceptedParents);
    expect(result.status).toBe('parent-rejected');
  });

  it('classifies parent-missing when not found', () => {
    const result = classifyOrphan('child-4', 'nonexistent', 'qucp-post', acceptedParents);
    expect(result.status).toBe('parent-missing');
  });

  it('classifies parent-family-mismatch', () => {
    const result = classifyOrphan('child-5', 'wrongfam', 'qucp-post', acceptedParents);
    expect(result.status).toBe('parent-family-mismatch');
  });

  it('does not require network calls', () => {
    const result = classifyOrphan('test', 'post1234', 'qucp-post', acceptedParents);
    expect(result.status).toBe('linked');
  });
});

// ================================================================
//  THREAD STRUCTURE VALIDATION
// ================================================================

describe('thread structure validation', () => {
  const topicId = 'topic001';

  const topLevelReply = { entityId: 'r1', parentEntityId: topicId, parentReplyId: null };
  const nestedReply = { entityId: 'r2', parentEntityId: topicId, parentReplyId: 'r1' };
  const deepNested = { entityId: 'r3', parentEntityId: topicId, parentReplyId: 'r2' };

  describe('validateReplyChain', () => {
    it('accepts valid nested reply chain', () => {
      const result = validateReplyChain(deepNested, [topLevelReply, nestedReply, deepNested]);
      expect(result.status).toBe('valid-chain');
    });

    it('accepts top-level reply (no parentReplyId)', () => {
      const result = validateReplyChain(topLevelReply, [topLevelReply]);
      expect(result.status).toBe('valid-chain');
    });

    it('detects self-cycle', () => {
      const selfRef = { entityId: 'r1', parentEntityId: topicId, parentReplyId: 'r1' };
      const result = validateReplyChain(selfRef, [selfRef]);
      expect(result.status).toBe('self-cycle');
    });

    it('detects multi-reply cycle', () => {
      const a = { entityId: 'a', parentEntityId: topicId, parentReplyId: 'b' };
      const b = { entityId: 'b', parentEntityId: topicId, parentReplyId: 'a' };
      const result = validateReplyChain(a, [a, b]);
      expect(result.status).toBe('multi-reply-cycle');
    });

    it('detects longer cycle (3 nodes)', () => {
      const a = { entityId: 'a', parentEntityId: topicId, parentReplyId: 'c' };
      const b = { entityId: 'b', parentEntityId: topicId, parentReplyId: 'a' };
      const c = { entityId: 'c', parentEntityId: topicId, parentReplyId: 'b' };
      const result = validateReplyChain(a, [a, b, c]);
      expect(result.status).toBe('multi-reply-cycle');
    });

    it('detects cross-topic parent reply', () => {
      const crossTopic = { entityId: 'r2', parentEntityId: topicId, parentReplyId: 'r1' };
      const otherTopic = { entityId: 'r1', parentEntityId: 'other-topic', parentReplyId: null };
      const result = validateReplyChain(crossTopic, [otherTopic, crossTopic]);
      expect(result.status).toBe('cross-topic-parent');
    });

    it('reports missing parent reply', () => {
      const missing = { entityId: 'r2', parentEntityId: topicId, parentReplyId: 'nonexistent' };
      const result = validateReplyChain(missing, [missing]);
      expect(result.status).toBe('missing-parent-reply');
    });

    it('enforces depth limit', () => {
      // Build a chain of 10 nested replies
      const replies: Array<{ entityId: string; parentEntityId: string; parentReplyId: string | null }> = [];
      for (let i = 1; i <= 10; i++) {
        replies.push({
          entityId: `r${i}`,
          parentEntityId: topicId,
          parentReplyId: i === 1 ? null : `r${i - 1}`,
        });
      }
      const result = validateReplyChain(replies[9], replies, { maxDepth: 8 });
      expect(result.status).toBe('depth-limit-exceeded');
    });

    it('is deterministic regardless of input order', () => {
      const result1 = validateReplyChain(deepNested, [deepNested, topLevelReply, nestedReply]);
      const result2 = validateReplyChain(deepNested, [nestedReply, deepNested, topLevelReply]);
      expect(result1.status).toBe(result2.status);
    });
  });
});

