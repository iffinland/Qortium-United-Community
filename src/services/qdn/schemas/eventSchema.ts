// ===== Event Schema =====
//
// qucp-event: canonical standalone community event.
//
// Lifecycle (approved):
//   active → archived
//   archived is TERMINAL — no further same-state or content updates allowed.
//
// Immutable after publication:
//   entityId, ownerName, ownerAddress, schemaVersion, resourceFamily, createdAt
//
// Mutable (canonical owner only):
//   title, category, description, startDate, endDate, location, qdnUrl,
//   revision, status
//
// Temporal status (Upcoming / Ongoing / Past) is intentionally NOT stored.
// It is derived at read time from the authoritative startDate/endDate epochs.

import { z } from 'zod';
import {
  authoritativeEntityBase,
  SCHEMA_VERSION,
  titleField,
  timestampField,
} from './commonSchemas';

// ---- Lifecycle Status ----

export const EVENT_STATUS_VALUES = ['active', 'archived'] as const;

export type EventStatus = (typeof EVENT_STATUS_VALUES)[number];

/** Approved lifecycle transitions. Archived is terminal. */
export const EVENT_LIFECYCLE_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  active: ['active', 'archived'],
  archived: [],
} as const;

export function isApprovedEventLifecycleTransition(
  from: EventStatus,
  to: EventStatus,
): boolean {
  const allowed = EVENT_LIFECYCLE_TRANSITIONS[from];
  return allowed !== undefined && (allowed as readonly string[]).includes(to);
}

// ---- Immutable Fields ----

export const EVENT_IMMUTABLE_FIELDS = [
  'schemaVersion',
  'resourceFamily',
  'entityId',
  'ownerName',
  'ownerAddress',
  'createdAt',
] as const;

// ---- Schema Fields ----

const categoryField = z.string().trim().min(1).max(50);
const descriptionField = z.string().trim().min(1).max(100_000);
const startDateField = timestampField;
const endDateField = timestampField.optional();
const locationField = z.string().trim().min(1).max(200).optional().or(z.literal(''));
const qdnUrlField = z
  .string()
  .trim()
  .min('qdn://x/x'.length)
  .max(500)
  .regex(/^qdn:\/\//i, 'QDN URL must start with qdn://')
  .optional();
const revisionField = z.number().int().min(1);
const statusField = z.enum(EVENT_STATUS_VALUES);

// ---- Event Schema ----

export const eventSchema = authoritativeEntityBase
  .extend({
    resourceFamily: z.literal('qucp-event'),
    schemaVersion: z.literal(SCHEMA_VERSION),

    title: titleField,
    category: categoryField,
    description: descriptionField,
    startDate: startDateField,
    endDate: endDateField,
    location: locationField,
    qdnUrl: qdnUrlField,
    revision: revisionField,
    status: statusField,
  })
  .strict()
  .refine(
    (data) =>
      data.endDate === undefined || data.endDate >= data.startDate,
    {
      message: 'endDate must be greater than or equal to startDate',
    },
  );

export type QucpEvent = z.infer<typeof eventSchema>;
