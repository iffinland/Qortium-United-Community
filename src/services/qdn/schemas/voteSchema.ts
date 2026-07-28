// ===== Vote Schema =====
//
// qucp-vote: canonical community poll vote.
//
// Deterministic entityId from pollEntityId + voter wallet.
// Single-choice voting for v1.
// Immutable: schemaVersion, resourceFamily, pollEntityId, ownerName, ownerAddress, createdAt
// Vote change: new snapshot with same entityId (if poll.allowVoteChange === true)

import { z } from 'zod';
import {
  SCHEMA_VERSION,
  entityIdField,
  ownerNameField,
  ownerAddressField,
  timestampField,
  editedAtField,
} from './commonSchemas';

const optionIdField = z
  .string()
  .min(4)
  .max(32);

export const voteSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  resourceFamily: z.literal('qucp-vote'),

  entityId: entityIdField,
  pollEntityId: entityIdField,

  /** v1: single choice. Array shape retained for future multi-choice extension. */
  optionIds: z.array(optionIdField).length(1, 'Exactly one option required for v1'),

  ownerName: ownerNameField,
  ownerAddress: ownerAddressField,

  createdAt: timestampField,
  editedAt: editedAtField,
}).strict()
  .refine(
    (data) => new Set(data.optionIds).size === data.optionIds.length,
    { message: 'Duplicate option IDs in vote' },
  );

export type QucpVote = z.infer<typeof voteSchema>;

export const VOTE_IMMUTABLE_FIELDS = [
  'schemaVersion',
  'resourceFamily',
  'entityId',
  'pollEntityId',
  'ownerName',
  'ownerAddress',
  'createdAt',
] as const;
