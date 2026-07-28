// ===== Post Comment Schema =====
//
// qucp-post-comment: comments on community posts.
//
// Immutable: schemaVersion, resourceFamily, entityId, parentEntityId, ownerName, ownerAddress, createdAt
// Mutable: content
// Prohibited: reactionCount, isHidden, moderatedBy, tipCount

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

export const postCommentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  resourceFamily: z.literal('qucp-post-comment'),

  entityId: entityIdField,
  parentEntityId: entityIdField,

  ownerName: ownerNameField,
  ownerAddress: ownerAddressField,

  content: contentField,

  createdAt: timestampField,
  editedAt: editedAtField,
}).strict();

export type QucpPostComment = z.infer<typeof postCommentSchema>;

export const POST_COMMENT_IMMUTABLE_FIELDS = [
  'schemaVersion',
  'resourceFamily',
  'entityId',
  'parentEntityId',
  'ownerName',
  'ownerAddress',
  'createdAt',
] as const;
