// ===== Common QDN Schemas =====
//
// Reusable Zod primitives for all qucp resource families.
// These enforce: schema version, entity IDs, QDN names, wallet addresses,
// timestamps, bounded strings, and bounded arrays.

import { z } from 'zod';

// ---- Schema strictness policy ----
//
// All security-sensitive entity schemas MUST use .strict() to reject
// unknown keys. Silently stripping unknown fields is not acceptable
// for authoritative entity payloads — it would allow malicious or
// obsolete fields (isPinned, moderatedBy, reactionCount, etc.) to
// pass through unnoticed.
//
// Document any intentionally extensible objects separately.

// ---- Schema Version ----

/** All qucp resources use schema version 1. */
export const SCHEMA_VERSION = 1 as const;

export const schemaVersionField = z.literal(SCHEMA_VERSION);

// ---- Entity ID ----

/** Entity ID: alphanumeric + hyphens, 8–64 characters. */
export const entityIdField = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Entity ID must be lowercase alphanumeric with hyphens');

// ---- QDN Name ----

/** QDN publisher name: alphanumeric, underscores, hyphens, 1–64 characters. */
export const qdnNameField = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'QDN name must be alphanumeric with underscores/hyphens');

// ---- Wallet Address ----

/** Qortium wallet address: starts with Q, base58, 33–36 characters. */
export const walletAddressField = z
  .string()
  .min(33)
  .max(36)
  .regex(/^Q[A-Za-z0-9]+$/, 'Wallet address must be a valid Qortium address');

// ---- Timestamps ----

/** Epoch milliseconds, must be in a reasonable range (2020–2100). */
export const timestampField = z
  .number()
  .int()
  .min(1577836800000) // 2020-01-01
  .max(4102444800000); // 2100-01-01

/** Optional edited-at timestamp. */
export const editedAtField = timestampField.optional();

// ---- Content Fields ----

export const titleField = z.string().min(1).max(200);
export const contentField = z.string().min(1).max(100_000);
export const summaryField = z.string().max(500).optional();

// ---- Tags ----

export const tagField = z.string().min(1).max(50).regex(/^[a-z0-9][a-z0-9-]*$/);
export const tagsField = z.array(tagField).max(20).optional();

// ---- Slug ----

export const slugField = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens');

// ---- Category ----

export const categoryIdField = z.string().min(1).max(50);

// ---- Status ----

export const entityStatusField = z.enum(['active']);

// ---- Owner Identity ----

export const ownerNameField = qdnNameField;
export const ownerAddressField = walletAddressField;

// ---- Resource Family ----

export const resourceFamilyField = z.enum([
  'qucp-post',
  'qucp-wiki',
  'qucp-forum-topic',
  'qucp-support-ticket',
  'qucp-support-ticket-status',
  'qucp-post-comment',
  'qucp-forum-reply',
  'qucp-ticket-reply',
  'qucp-support-category',
  'qucp-poll',
  'qucp-vote',
  'qucp-project',
  'qucp-event',
  'qucp-reaction',
  'qucp-owner-tombstone',
] as const);

export type QucpResourceFamily = z.infer<typeof resourceFamilyField>;

// ---- Authoritative Entity Base ----

/**
 * Base fields shared by all authoritative entity schemas.
 * Every qucp entity MUST include these fields.
 */
export const authoritativeEntityBase = z.object({
  schemaVersion: schemaVersionField,
  resourceFamily: resourceFamilyField,
  entityId: entityIdField,
  ownerName: ownerNameField,
  ownerAddress: ownerAddressField,
  createdAt: timestampField,
  editedAt: editedAtField,
});

export type AuthoritativeEntityBase = z.infer<typeof authoritativeEntityBase>;

// ---- Content Limits ----

export const CONTENT_LIMITS = {
  title: { min: 1, max: 200 },
  content: { min: 1, max: 100_000 },
  summary: { max: 500 },
  tags: { maxCount: 20, maxTagLength: 50 },
  slug: { min: 1, max: 100 },
  entityId: { min: 8, max: 64 },
  qdnName: { min: 1, max: 64 },
  categoryId: { max: 50 },
  walletAddress: { min: 33, max: 36 },
} as const;
