// ===== Post Schema =====
//
// qucp-post: community announcements and articles.
//
// Immutable: schemaVersion, resourceFamily, entityId, ownerName, ownerAddress, createdAt
// Mutable: title, content, summary, tags, coverMediaEntityId
// Prohibited: reactionCount, commentCount, tipCount, isPinned, isHidden, moderatedBy
//
// Media: cover images use qucp-media-reference entities, not arbitrary URLs.

import { z } from 'zod';
import {
  authoritativeEntityBase,
  titleField,
  contentField,
  summaryField,
  tagsField,
  entityIdField,
  SCHEMA_VERSION,
} from './commonSchemas';

// ---- Cover Media Reference (optional) ----
//
// Links to a qucp-media-reference entity for the cover image.
// Arbitrary URLs (http, https, ipfs, data, blob) are rejected.

const coverMediaRefField = entityIdField.optional();

// ---- Post Schema ----

export const postSchema = authoritativeEntityBase.extend({
  resourceFamily: z.literal('qucp-post'),
  schemaVersion: z.literal(SCHEMA_VERSION),

  title: titleField,
  content: contentField,
  summary: summaryField,
  tags: tagsField,
  coverMediaEntityId: coverMediaRefField,
}).strict();

export type QucpPost = z.infer<typeof postSchema>;

/** Field names that MUST NOT change across updates. */
export const POST_IMMUTABLE_FIELDS = [
  'schemaVersion',
  'resourceFamily',
  'entityId',
  'ownerName',
  'ownerAddress',
  'createdAt',
] as const;
