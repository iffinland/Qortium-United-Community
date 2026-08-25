// ===== Post Comment Canonical Write/Read-Back Regression =====

import { describe, expect, it } from 'vitest';
import { store } from '../store';
import { qortiumApi } from '../store/api/qortiumApi';
import { queryComments, buildCommentPayload } from '../services/qdn/runtime/commentRuntime';
import { IdentityResolver } from '../services/qdn/IdentityResolver';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import { installMockQdnBridge } from './helpers/mockQdnBridge';

const OWNER = QUC_SYSOP_ADDRESS;
const OWNER_NAME = 'iffi_vaba_mees';
const POST_ID = 'post0001';
const COMMENT_ID = 'comment01';
const IDENTIFIER = `qucp-post-comment-${COMMENT_ID}`;

const payload = buildCommentPayload({
  entityId: COMMENT_ID,
  parentEntityId: POST_ID,
  content: 'A canonical comment',
  authorName: OWNER_NAME,
  authorAddress: OWNER,
  now: 1700000000000,
});

describe('post comment canonical write/read-back', () => {
  it('reads a published comment whose parent relationship uses parentEntityId', async () => {
    const result = await queryComments(
      async () => [
        {
          name: OWNER_NAME,
          service: 'DOCUMENT',
          identifier: IDENTIFIER,
          created: 1700000000000,
        },
      ],
      async () => payload,
      new IdentityResolver(async () => OWNER),
    );

    expect(result.status).toBe('complete');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].envelope.data.parentEntityId).toBe(POST_ID);
    expect(result.items[0].envelope.data.content).toBe('A canonical comment');
    expect(result.items[0].envelope.data.entityId).toBe(COMMENT_ID);
  });

  it('publishes a canonical post comment under the correct parent post', async () => {
    store.dispatch(qortiumApi.util.resetApiState());
    const bridge = installMockQdnBridge();

    try {
      const result = await store.dispatch(
        qortiumApi.endpoints.addComment.initiate({
          postId: POST_ID,
          content: 'Published comment',
          authorName: OWNER_NAME,
          authorAddress: OWNER,
        }),
      );

      expect(result).toHaveProperty('data');
      const published = bridge.published.find(
        (item) =>
          item.service === 'DOCUMENT' &&
          item.identifier.startsWith('qucp-post-comment-pc-'),
      );

      expect(published).toBeDefined();
      expect(published?.payload).toMatchObject({
        schemaVersion: 1,
        resourceFamily: 'qucp-post-comment',
        parentEntityId: POST_ID,
        content: 'Published comment',
        ownerName: OWNER_NAME,
        ownerAddress: OWNER,
      });
    } finally {
      bridge.cleanup();
    }
  });
});
