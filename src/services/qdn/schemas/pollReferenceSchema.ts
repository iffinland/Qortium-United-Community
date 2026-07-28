// ===== Poll Reference Schema =====
//
// Strict schema for a QDN poll reference — a lightweight link
// from a QDN entity to a native Qortium Core poll.
//
// Does NOT embed votes, results, or mutable poll state.
// Those are always fetched from Core directly.

import { z } from 'zod';

// ---- Schema Version and Family ----

export const POLL_REFERENCE_SCHEMA_VERSION = 1 as const;

// ---- Parent Families ----

export const POLL_PARENT_FAMILIES = ['qucp-post', 'qucp-wiki', 'qucp-forum-topic'] as const;
export type PollParentFamily = (typeof POLL_PARENT_FAMILIES)[number];

// ---- Field Schemas ----

const entityIdField = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Entity ID must be lowercase alphanumeric with hyphens');

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

/** Native poll identifier — Core-assigned stable numeric ID. */
const pollIdField = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[1-9][0-9]*$/, 'Poll ID must be a positive integer string');

/** Native poll name — Core-assigned, 3–400 chars. */
const pollNameField = z
  .string()
  .min(3)
  .max(400);

/** Transaction signature — optional, stored for audit. */
const txSignatureField = z
  .string()
  .max(128)
  .regex(/^[A-Za-z0-9+/=]+$/, 'Transaction signature must be base64')
  .optional();

// ---- Full Schema ----

export const pollReferenceSchema = z
  .object({
    schemaVersion: z.literal(POLL_REFERENCE_SCHEMA_VERSION),
    resourceFamily: z.literal('qucp-poll-reference'),

    /** This reference's own entity ID. */
    entityId: entityIdField,

    /** The parent entity that contains this poll. */
    parentFamily: z.enum(POLL_PARENT_FAMILIES),
    parentEntityId: entityIdField,

    /** Native Core poll identifier. */
    pollId: pollIdField,

    /** Native Core poll name (for display/diagnostics). */
    pollName: pollNameField.optional(),

    /** Creation transaction signature (for audit). */
    creationTransactionSignature: txSignatureField,

    /** The QDN publisher who created this reference (must match parent owner). */
    ownerName: qdnNameField,
    ownerAddress: walletField,

    /** Timestamp. */
    createdAt: z.number().int().positive(),
  })
  .strict();

export type QucpPollReference = z.infer<typeof pollReferenceSchema>;
