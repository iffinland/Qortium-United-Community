// ===== Poll Schema =====
//
// qucp-poll: canonical standalone community poll.
//
// Immutable after publication: question, description, options (with stable option IDs),
//   expiresAt, allowVoteChange, ownerName, ownerAddress, entityId, schemaVersion,
//   resourceFamily, createdAt
// Mutable (canonical owner only): isClosed (false → true only)

import { z } from 'zod';
import {
  authoritativeEntityBase,
  SCHEMA_VERSION,
} from './commonSchemas';

// ---- Option Schema ----

const optionIdField = z
  .string()
  .min(4)
  .max(32)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Option ID must be lowercase alphanumeric with hyphens');

const optionLabelField = z.string().min(1).max(200).trim();

const pollOptionSchema = z.object({
  optionId: optionIdField,
  label: optionLabelField,
}).strict();

// ---- Poll Schema ----

const questionField = z.string().min(1).max(300).trim();
const descriptionField = z.string().max(2000).optional();
const expiresAtField = z.number().int().positive().optional();

export const pollSchema = authoritativeEntityBase.extend({
  resourceFamily: z.literal('qucp-poll'),
  schemaVersion: z.literal(SCHEMA_VERSION),

  question: questionField,
  description: descriptionField,
  options: z.array(pollOptionSchema).min(2).max(20),
  expiresAt: expiresAtField,
  isClosed: z.boolean(),
  allowVoteChange: z.boolean(),
}).strict()
  .refine(
    (data) => {
      const ids = data.options.map((o) => o.optionId);
      return new Set(ids).size === ids.length;
    },
    { message: 'Duplicate option IDs in poll options' },
  )
  .refine(
    (data) => {
      const labels = data.options.map((o) => o.label.toLowerCase().trim());
      return new Set(labels).size === labels.length;
    },
    { message: 'Duplicate option labels in poll options' },
  );

export type QucpPoll = z.infer<typeof pollSchema>;

export const POLL_IMMUTABLE_FIELDS = [
  'schemaVersion',
  'resourceFamily',
  'entityId',
  'question',
  'description',
  'options',
  'expiresAt',
  'allowVoteChange',
  'ownerName',
  'ownerAddress',
] as const;
