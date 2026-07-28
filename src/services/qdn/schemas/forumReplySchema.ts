// ===== Forum Reply Schema =====
//
// qucp-forum-reply: replies to forum topics.
//
// Immutable: schemaVersion, resourceFamily, entityId, parentEntityId, ownerName, ownerAddress, createdAt
// Mutable: content, parentReplyId
// Prohibited: likes, replyCount, isHidden, moderatedBy

import { z } from 'zod';
import {
  SCHEMA_VERSION,
  entityIdField,
  ownerNameField,
  ownerAddressField,
  timestampField,
  editedAtField,
  contentField,
} from './commonSchemas';

export const forumReplySchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  resourceFamily: z.literal('qucp-forum-reply'),

  entityId: entityIdField,
  /** The forum topic this reply belongs to. */
  parentEntityId: entityIdField,
  /** Optional: parent reply for nested threading (null = top-level reply to topic). */
  parentReplyId: entityIdField.nullable().optional(),

  ownerName: ownerNameField,
  ownerAddress: ownerAddressField,

  content: contentField,

  createdAt: timestampField,
  editedAt: editedAtField,
}).strict();

export type QucpForumReply = z.infer<typeof forumReplySchema>;

export const FORUM_REPLY_IMMUTABLE_FIELDS = [
  'schemaVersion',
  'resourceFamily',
  'entityId',
  'parentEntityId',
  'parentReplyId',
  'ownerName',
  'ownerAddress',
  'createdAt',
] as const;
