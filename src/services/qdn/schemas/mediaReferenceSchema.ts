// ===== Media Reference Schema =====
//
// Strict schema for a QDN media reference.
// Links a parent entity to a QDN media resource (IMAGE, FILE, etc.).
// Does NOT embed binary data, external URLs, or base64.

import { z } from 'zod';

// ---- Schema Version and Family ----

export const MEDIA_REFERENCE_SCHEMA_VERSION = 1 as const;

// ---- Parent Families ----

export const MEDIA_PARENT_FAMILIES = [
  'qucp-post',
  'qucp-wiki',
  'qucp-forum-topic',
  'qucp-support-ticket',
  'qucp-project',
] as const;
export type MediaParentFamily = (typeof MEDIA_PARENT_FAMILIES)[number];

// ---- Media Roles ----

export const MEDIA_ROLES = [
  'cover',
  'thumbnail',
  'inline-image',
  'attachment',
  'banner',
] as const;
export type MediaRole = (typeof MEDIA_ROLES)[number];

// ---- Supported QDN Services ----

export const SUPPORTED_MEDIA_SERVICES = [
  'IMAGE',
  'THUMBNAIL',
  'FILE',
  'VIDEO',
  'AUDIO',
] as const;
export type SupportedMediaService = (typeof SUPPORTED_MEDIA_SERVICES)[number];

// ---- Role-Parent Compatibility ----

export const MEDIA_ROLE_PARENT_MATRIX: Record<MediaRole, readonly MediaParentFamily[]> = {
  cover:           ['qucp-post', 'qucp-wiki', 'qucp-project'],
  thumbnail:       ['qucp-post', 'qucp-wiki'],
  'inline-image':  ['qucp-post', 'qucp-wiki', 'qucp-forum-topic'],
  attachment:      ['qucp-post', 'qucp-forum-topic', 'qucp-support-ticket', 'qucp-wiki'],
  banner:          ['qucp-post', 'qucp-forum-topic'],
};

// ---- Role-Service Compatibility ----

export const MEDIA_ROLE_SERVICE_MATRIX: Record<MediaRole, readonly SupportedMediaService[]> = {
  cover:           ['IMAGE'],
  thumbnail:       ['THUMBNAIL', 'IMAGE'],
  'inline-image':  ['IMAGE'],
  attachment:      ['FILE', 'IMAGE', 'VIDEO', 'AUDIO'],
  banner:          ['IMAGE'],
};

// ---- Field Schemas ----

const entityIdField = z.string().min(8).max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const walletField = z.string().min(33).max(36).regex(/^Q[A-Za-z0-9]+$/);
const qdnNameField = z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const qdnIdentifierField = z.string().min(1).max(64);

// ---- Full Schema ----

export const mediaReferenceSchema = z.object({
  schemaVersion: z.literal(MEDIA_REFERENCE_SCHEMA_VERSION),
  resourceFamily: z.literal('qucp-media-reference'),

  entityId: entityIdField,
  parentFamily: z.enum(MEDIA_PARENT_FAMILIES),
  parentEntityId: entityIdField,
  mediaRole: z.enum(MEDIA_ROLES),

  qdnService: z.enum(SUPPORTED_MEDIA_SERVICES),
  qdnIdentifier: qdnIdentifierField,

  ownerName: qdnNameField,
  ownerAddress: walletField,

  filename: z.string().max(255).optional(),
  mimeType: z.string().max(127).regex(/^[a-z]+\/[-a-z0-9+.]+$/, 'Invalid MIME type').optional(),
  size: z.number().int().nonnegative().optional(),

  createdAt: z.number().int().positive(),
}).strict().refine(
  (data) => MEDIA_ROLE_PARENT_MATRIX[data.mediaRole].includes(data.parentFamily as MediaParentFamily),
  'Media role not compatible with parent family',
).refine(
  (data) => MEDIA_ROLE_SERVICE_MATRIX[data.mediaRole].includes(data.qdnService as SupportedMediaService),
  'QDN service not compatible with media role',
);

export type QucpMediaReference = z.infer<typeof mediaReferenceSchema>;
