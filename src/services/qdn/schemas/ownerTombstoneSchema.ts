// ===== Owner Tombstone Schema =====
//
// qucp-owner-tombstone: owner-authorized deletion/restoration.
// Only the validated entity owner may tombstone. Moderator actions
// use a separate future moderation operation family.

import { z } from 'zod';
import {
  SCHEMA_VERSION,
  entityIdField,
  ownerNameField,
  ownerAddressField,
  timestampField,
} from './commonSchemas';

const TOMBSTONE_TARGET_FAMILIES = [
  'qucp-post',
  'qucp-wiki',
  'qucp-forum-topic',
  'qucp-support-ticket',
  'qucp-post-comment',
  'qucp-forum-reply',
  'qucp-ticket-reply',
  'qucp-media-reference',
] as const;

const TOMBSTONE_ACTIONS = ['delete', 'restore'] as const;

export const ownerTombstoneSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  resourceFamily: z.literal('qucp-owner-tombstone'),

  operationId: entityIdField,

  targetFamily: z.enum(TOMBSTONE_TARGET_FAMILIES),
  targetEntityId: entityIdField,

  ownerName: ownerNameField,
  ownerAddress: ownerAddressField,

  action: z.enum(TOMBSTONE_ACTIONS),
  reason: z.string().max(500).optional(),

  createdAt: timestampField,
}).strict();

export type QucpOwnerTombstone = z.infer<typeof ownerTombstoneSchema>;
