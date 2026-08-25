// ===== Event Domain Production-Path Tests =====
//
// Covers the canonical Event schema, identifier, lifecycle builders, and the
// pure temporal-status derivation/grouping rules.

import { describe, it, expect } from 'vitest';
import {
  eventSchema,
  EVENT_IMMUTABLE_FIELDS,
  isApprovedEventLifecycleTransition,
} from '../services/qdn/schemas/eventSchema';
import {
  deriveEventTemporalStatus,
  groupEventsByTemporalStatus,
} from '../services/events/eventStatus';
import {
  buildQucpIdentifier,
  parseQucpIdentifier,
} from '../services/qdn/identifiers/qucpIdentifiers';
import {
  generateEventEntityId,
  buildEventCreatePayload,
  buildEventUpdatePayload,
} from '../services/qdn/runtime/eventRuntime';

const OWNER = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

const validEvent = () => ({
  schemaVersion: 1 as const,
  resourceFamily: 'qucp-event' as const,
  entityId: 'ev-test1234',
  title: 'Test Event',
  category: 'Community',
  description: 'Event details',
  startDate: 1700000000000,
  ownerName: 'Alice',
  ownerAddress: OWNER,
  createdAt: 1700000000000,
  revision: 1,
  status: 'active' as const,
});

describe('event schema', () => {
  it('accepts a valid event', () => {
    expect(eventSchema.safeParse(validEvent()).success).toBe(true);
  });

  it('rejects unknown fields (strict)', () => {
    expect(eventSchema.safeParse({ ...validEvent(), statusLabel: 'Past' }).success).toBe(false);
  });

  it('rejects endDate before startDate', () => {
    expect(
      eventSchema.safeParse({ ...validEvent(), endDate: 1699999999999 }).success,
    ).toBe(false);
  });

  it('accepts endDate equal to startDate (point-in-time)', () => {
    expect(
      eventSchema.safeParse({ ...validEvent(), endDate: 1700000000000 }).success,
    ).toBe(true);
  });

  it('accepts optional fields', () => {
    expect(
      eventSchema.safeParse({
        ...validEvent(),
        endDate: 1700003600000,
        location: 'Tallinn',
        qdnUrl: 'qdn://DOCUMENT/Alice/agenda',
      }).success,
    ).toBe(true);
  });

  it('rejects non-qdn qdnUrl', () => {
    expect(eventSchema.safeParse({ ...validEvent(), qdnUrl: 'https://example.com' }).success).toBe(false);
  });
});

describe('event identifiers and lifecycle', () => {
  it('builds and parses qucp-event identifiers', () => {
    const identifier = buildQucpIdentifier('qucp-event', 'ev-test1234');
    expect(identifier).toBe('qucp-event-ev-test1234');
    const parsed = parseQucpIdentifier(identifier);
    expect(parsed?.family).toBe('qucp-event');
    expect(parsed?.entityId).toBe('ev-test1234');
  });

  it('generates collision-resistant ev- IDs', () => {
    const id = generateEventEntityId();
    expect(id).toMatch(/^ev-[a-z0-9-]+$/);
  });

  it('allows active -> archived and treats archived as terminal', () => {
    expect(isApprovedEventLifecycleTransition('active', 'archived')).toBe(true);
    expect(isApprovedEventLifecycleTransition('active', 'active')).toBe(true);
    expect(isApprovedEventLifecycleTransition('archived', 'active')).toBe(false);
  });

  it('keeps identity fields immutable', () => {
    expect(EVENT_IMMUTABLE_FIELDS).toContain('entityId');
    expect(EVENT_IMMUTABLE_FIELDS).toContain('ownerAddress');
    expect(EVENT_IMMUTABLE_FIELDS).toContain('createdAt');
  });
});

describe('event payload builders', () => {
  it('builds a canonical create payload', () => {
    const payload = buildEventCreatePayload({
      entityId: 'ev-create01',
      category: 'Workshop',
      title: 'Build Day',
      description: '[b]Join us[/b]',
      startDate: 1700000000000,
      endDate: 1700003600000,
      ownerName: 'Alice',
      ownerAddress: OWNER,
      createdAt: 1700000000000,
    });

    expect(payload.resourceFamily).toBe('qucp-event');
    expect(payload.status).toBe('active');
    expect(payload.revision).toBe(1);
    expect(eventSchema.safeParse(payload).success).toBe(true);
  });

  it('increments revision and preserves immutable fields on update', () => {
    const existing = buildEventCreatePayload({
      entityId: 'ev-update01',
      category: 'Community',
      title: 'Old Title',
      description: 'Old',
      startDate: 1700000000000,
      ownerName: 'Alice',
      ownerAddress: OWNER,
      createdAt: 1700000000000,
    });

    const updated = buildEventUpdatePayload({
      existing,
      category: 'Governance',
      title: 'New Title',
      description: 'New',
      startDate: 1700003600000,
      ownerName: existing.ownerName,
      ownerAddress: existing.ownerAddress,
      expectedRevision: 1,
    });

    expect(updated.revision).toBe(2);
    expect(updated.entityId).toBe(existing.entityId);
    expect(updated.ownerName).toBe(existing.ownerName);
    expect(updated.ownerAddress).toBe(existing.ownerAddress);
    expect(updated.createdAt).toBe(existing.createdAt);
  });

  it('supports archiving via update builder', () => {
    const existing = buildEventCreatePayload({
      entityId: 'ev-archive1',
      category: 'Community',
      title: 'Old',
      description: 'Old',
      startDate: 1700000000000,
      ownerName: 'Alice',
      ownerAddress: OWNER,
      createdAt: 1700000000000,
    });

    const archived = buildEventUpdatePayload({
      existing,
      category: existing.category,
      title: existing.title,
      description: existing.description,
      startDate: existing.startDate,
      ownerName: existing.ownerName,
      ownerAddress: existing.ownerAddress,
      expectedRevision: 1,
      newStatus: 'archived',
    });

    expect(archived.status).toBe('archived');
    expect(archived.revision).toBe(2);
  });
});

describe('event temporal status derivation', () => {
  it('derives upcoming / ongoing / past from authoritative times', () => {
    expect(deriveEventTemporalStatus(1000, 2000, 500)).toBe('upcoming');
    expect(deriveEventTemporalStatus(1000, 2000, 1500)).toBe('ongoing');
    expect(deriveEventTemporalStatus(1000, 2000, 2500)).toBe('past');
  });

  it('uses startDate as the effective end when endDate is omitted', () => {
    expect(deriveEventTemporalStatus(1000, null, 500)).toBe('upcoming');
    expect(deriveEventTemporalStatus(1000, null, 1500)).toBe('past');
    expect(deriveEventTemporalStatus(1000, null, 1000)).toBe('past');
  });

  it('fails closed to upcoming for invalid start', () => {
    expect(deriveEventTemporalStatus(Number.NaN, 2000, 1500)).toBe('upcoming');
  });
});

describe('event temporal grouping', () => {
  it('groups and orders deterministically', () => {
    const grouped = groupEventsByTemporalStatus(
      [
        { entityId: 'past-2', startDateMs: 500, endDateMs: 600 },
        { entityId: 'up-1', startDateMs: 1500, endDateMs: 1600 },
        { entityId: 'on-1', startDateMs: 900, endDateMs: 1600 },
        { entityId: 'up-2', startDateMs: 2000, endDateMs: null },
        { entityId: 'past-1', startDateMs: 100, endDateMs: 200 },
      ],
      1000,
    );

    expect(grouped.upcoming.map((e) => e.entityId)).toEqual(['up-1', 'up-2']);
    expect(grouped.ongoing.map((e) => e.entityId)).toEqual(['on-1']);
    expect(grouped.past.map((e) => e.entityId)).toEqual(['past-2', 'past-1']);
  });

  it('returns empty groups for an empty list', () => {
    expect(groupEventsByTemporalStatus([], 1000)).toEqual({
      upcoming: [],
      ongoing: [],
      past: [],
    });
  });
});
