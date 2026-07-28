// ===== Moderation Operation Schema =====
//
// Strict schema for qucp-moderation operations.
// Moderation is an independent resource — it does NOT replace entity content.

import { z } from 'zod';

// ---- Schema Version and Family ----

export const MODERATION_SCHEMA_VERSION = 1 as const;

// ---- Moderation Actions ----

export const MODERATION_ACTIONS = [
  'hide',
  'restore',
  'lock',
  'unlock',
  'feature',
  'unfeature',
  'close',
  'reopen',
  'mark-resolved',
  'mark-unresolved',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

// ---- Moderation Target Families ----

export const MODERATION_TARGET_FAMILIES = [
  'qucp-post',
  'qucp-wiki',
  'qucp-forum-topic',
  'qucp-support-ticket',
  'qucp-post-comment',
  'qucp-forum-reply',
  'qucp-ticket-reply',
] as const;
export type ModerationTargetFamily = (typeof MODERATION_TARGET_FAMILIES)[number];

// ---- Action-Target Compatibility Matrix ----

/**
 * Which actions are valid for which target families.
 * Defined in application code, not in the registry payload.
 */
export const ACTION_TARGET_MATRIX: Record<ModerationAction, readonly ModerationTargetFamily[]> = {
  hide:          ['qucp-post', 'qucp-wiki', 'qucp-forum-topic', 'qucp-support-ticket', 'qucp-post-comment', 'qucp-forum-reply', 'qucp-ticket-reply'],
  restore:       ['qucp-post', 'qucp-wiki', 'qucp-forum-topic', 'qucp-support-ticket', 'qucp-post-comment', 'qucp-forum-reply', 'qucp-ticket-reply'],
  lock:          ['qucp-forum-topic'],
  unlock:        ['qucp-forum-topic'],
  feature:       ['qucp-post', 'qucp-wiki'],
  unfeature:     ['qucp-post', 'qucp-wiki'],
  close:         ['qucp-support-ticket'],
  reopen:        ['qucp-support-ticket'],
  'mark-resolved':   ['qucp-support-ticket'],
  'mark-unresolved': ['qucp-support-ticket'],
};

/** Inverse action map for state reduction. */
export const INVERSE_ACTIONS: Partial<Record<ModerationAction, ModerationAction>> = {
  hide: 'restore',
  restore: 'hide',
  lock: 'unlock',
  unlock: 'lock',
  feature: 'unfeature',
  unfeature: 'feature',
  close: 'reopen',
  reopen: 'close',
  'mark-resolved': 'mark-unresolved',
  'mark-unresolved': 'mark-resolved',
};

// ---- Field Schemas ----

const walletField = z
  .string()
  .min(33)
  .max(36)
  .regex(/^Q[A-Za-z0-9]+$/, 'Invalid wallet address');

const qdnNameField = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'QDN name must be alphanumeric');

const operationIdField = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Operation ID must be lowercase alphanumeric with hyphens');

const entityIdField = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Entity ID must be lowercase alphanumeric with hyphens');

// ---- Full Moderation Schema ----

export const moderationOperationSchema = z
  .object({
    schemaVersion: z.literal(MODERATION_SCHEMA_VERSION),
    resourceFamily: z.literal('qucp-moderation'),

    /** Immutable operation identity — used in operation key derivation. */
    operationId: operationIdField,

    /** Target entity family and ID. */
    targetFamily: z.enum(MODERATION_TARGET_FAMILIES),
    targetEntityId: entityIdField,

    /** The moderation action to apply. */
    action: z.enum(MODERATION_ACTIONS),

    /** The actor performing moderation (must match publisher). */
    actorName: qdnNameField,
    actorAddress: walletField,

    /** Optional reason for the moderation action. */
    reason: z.string().max(500).optional(),

    /** Exact role snapshot used for authorization. */
    registrySnapshotId: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Snapshot ID must be lowercase alphanumeric with hyphens'),

    /** Exact role snapshot identifier (qucp-rs-{key}). */
    registrySnapshotIdentifier: z
      .string()
      .min(20)
      .max(64)
      .regex(/^qucp-rs-[a-f0-9]+$/, 'Must be a valid role snapshot identifier'),

    /** Timestamp. */
    createdAt: z.number().int().positive(),
  })
  .strict()
  .refine(
    (data) => {
      const allowed = ACTION_TARGET_MATRIX[data.action] as readonly string[];
      return allowed.includes(data.targetFamily);
    },
    'Action is not valid for target family',
  );

export type QucpModerationOperation = z.infer<typeof moderationOperationSchema>;
