// ===== Timestamp Integrity Tests =====

import { describe, it, expect } from 'vitest';
import { toPostView, toCommentView } from '../store/api/qortiumApi';
import { toForumThreadView, toForumReplyView } from '../store/api/forumApi';

const CREATED = 1700000000000;
const UPDATED = 1700000001000;

function postEnv(created?: number) {
  return {
    entityId: 'post0001',
    publisherName: 'Alice',
    publisherAddress: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    envelope: {
      data: {
        title: 'Post',
        content: 'Content',
        tags: [],
        coverMediaEntityId: undefined,
      },
      metadata: { name: 'Alice', created, updated: created },
    },
  } as Parameters<typeof toPostView>[0];
}

function commentEnv(created?: number) {
  return {
    entityId: 'comment0001',
    publisherName: 'Alice',
    publisherAddress: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    envelope: {
      data: { parentEntityId: 'post0001', content: 'Comment' },
      metadata: { name: 'Alice', created },
    },
  } as Parameters<typeof toCommentView>[0];
}

function threadEnv(created?: number, updated?: number) {
  return {
    entityId: 'thread0001',
    publisherName: 'Alice',
    publisherAddress: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    envelope: {
      data: { title: 'Thread', content: 'Content', categoryId: 'general', tags: [] },
      metadata: { name: 'Alice', created, updated },
    },
  } as Parameters<typeof toForumThreadView>[0];
}

function replyEnv(created?: number) {
  return {
    entityId: 'reply0001',
    publisherName: 'Alice',
    publisherAddress: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    envelope: {
      data: { parentEntityId: 'thread0001', content: 'Reply', parentReplyId: null },
      metadata: { name: 'Alice', created },
    },
  } as Parameters<typeof toForumReplyView>[0];
}

describe('projection timestamps', () => {
  it('projects valid post metadata timestamps', () => {
    const view = toPostView(postEnv(CREATED));
    expect(view.createdAt).toBe(new Date(CREATED).toISOString());
    expect(view.createdAtMs).toBe(CREATED);
  });

  it('projects missing post created timestamp as null', () => {
    const view = toPostView(postEnv(undefined));
    expect(view.createdAt).toBeNull();
    expect(view.createdAtMs).toBeNull();
  });

  it('projects valid comment timestamps', () => {
    const view = toCommentView(commentEnv(CREATED));
    expect(view.createdAt).toBe(new Date(CREATED).toISOString());
  });

  it('projects missing comment timestamp as null', () => {
    const view = toCommentView(commentEnv(undefined));
    expect(view.createdAt).toBeNull();
  });

  it('projects valid forum thread timestamps', () => {
    const view = toForumThreadView(threadEnv(CREATED, UPDATED));
    expect(view.createdAt).toBe(new Date(CREATED).toISOString());
    expect(view.updatedAt).toBe(new Date(UPDATED).toISOString());
  });

  it('projects missing forum thread timestamps as null', () => {
    const view = toForumThreadView(threadEnv(undefined, undefined));
    expect(view.createdAt).toBeNull();
    expect(view.updatedAt).toBeNull();
  });

  it('projects valid forum reply timestamps', () => {
    const view = toForumReplyView(replyEnv(CREATED));
    expect(view.createdAt).toBe(new Date(CREATED).toISOString());
  });

  it('projects missing forum reply timestamp as null', () => {
    const view = toForumReplyView(replyEnv(undefined));
    expect(view.createdAt).toBeNull();
  });

  it('does not fabricate current time when metadata is missing', () => {
    const before = Date.now();
    const view = toPostView(postEnv(undefined));
    const after = Date.now();
    expect(view.createdAt).toBeNull();
    expect(before <= after).toBe(true);
  });
});
