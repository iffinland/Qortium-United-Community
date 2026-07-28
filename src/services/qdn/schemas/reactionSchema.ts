// ===== Reaction Schema =====
//
// qucp-reaction: actor-owned reaction on any supported entity.
// Each actor controls only their own reaction per target + type.
// active: true = reaction present, active: false = reaction withdrawn.

import { z } from 'zod';
import {
  SCHEMA_VERSION,
  entityIdField,
  ownerNameField,
  ownerAddressField,
  timestampField,
  editedAtField,
} from './commonSchemas';

const TARGET_FAMILIES = [
  'qucp-post',
  'qucp-wiki',
  'qucp-forum-topic',
  'qucp-post-comment',
  'qucp-forum-reply',
  'qucp-support-ticket',
  'qucp-ticket-reply',
] as const;

const REACTION_TYPES = ['like'] as const;

export const reactionSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  resourceFamily: z.literal('qucp-reaction'),

  operationId: entityIdField,

  targetFamily: z.enum(TARGET_FAMILIES),
  targetEntityId: entityIdField,

  actorName: ownerNameField,
  actorAddress: ownerAddressField,

  reactionType: z.enum(REACTION_TYPES),
  active: z.boolean(),

  createdAt: timestampField,
  editedAt: editedAtField,
}).strict();

export type QucpReaction = z.infer<typeof reactionSchema>;
