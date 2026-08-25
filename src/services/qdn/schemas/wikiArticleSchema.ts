// ===== Wiki Article Schema =====
//
// qucp-wiki: community knowledge base articles.
//
// Immutable: schemaVersion, resourceFamily, entityId, ownerName, ownerAddress, createdAt
// Mutable: title, slug, content, summary, categoryId, tags, revision, status
// Note: slug is a display/routing field — NOT the authoritative entity identity.

import { z } from 'zod';
import {
  authoritativeEntityBase,
  titleField,
  contentField,
  summaryField,
  tagsField,
  slugField,
  categoryIdField,
  SCHEMA_VERSION,
} from './commonSchemas';

const revisionField = z.number().int().min(1);
const statusField = z.enum(['active', 'archived']);

export const wikiArticleSchema = authoritativeEntityBase.extend({
  resourceFamily: z.literal('qucp-wiki'),
  schemaVersion: z.literal(SCHEMA_VERSION),

  title: titleField,
  slug: slugField,
  content: contentField,
  summary: summaryField,
  categoryId: categoryIdField,
  tags: tagsField,
  revision: revisionField,
  status: statusField,
}).strict();

export type QucpWikiArticle = z.infer<typeof wikiArticleSchema>;

export const WIKI_IMMUTABLE_FIELDS = [
  'schemaVersion',
  'resourceFamily',
  'entityId',
  'ownerName',
  'ownerAddress',
  'createdAt',
] as const;
