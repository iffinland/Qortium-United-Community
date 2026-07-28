// ===== Forum Topic Schema =====
//
// qucp-forum-topic: forum discussion topics.
//
// Immutable: schemaVersion, resourceFamily, entityId, ownerName, ownerAddress, createdAt
// Mutable: title, content, categoryId, tags
// Prohibited: replyCount, viewCount, isPinned, isLocked, isResolved (future moderation ops)

import { z } from 'zod';
import {
  authoritativeEntityBase,
  titleField,
  contentField,
  tagsField,
  categoryIdField,
  SCHEMA_VERSION,
} from './commonSchemas';

export const forumTopicSchema = authoritativeEntityBase.extend({
  resourceFamily: z.literal('qucp-forum-topic'),
  schemaVersion: z.literal(SCHEMA_VERSION),

  title: titleField,
  content: contentField,
  categoryId: categoryIdField,
  tags: tagsField,
}).strict();

export type QucpForumTopic = z.infer<typeof forumTopicSchema>;

export const FORUM_TOPIC_IMMUTABLE_FIELDS = [
  'schemaVersion',
  'resourceFamily',
  'entityId',
  'ownerName',
  'ownerAddress',
  'createdAt',
] as const;
