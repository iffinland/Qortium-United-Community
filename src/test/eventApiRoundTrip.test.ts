// ===== Event API Round-Trip Tests =====
//
// Production-path create / read / edit / archive round-trips plus the
// admin/owner authorization checks enforced below the UI.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store } from '../store';
import { eventApi, type EventListResult } from '../store/api/eventApi';
import { initializeAuth } from '../store/slices/authSlice';
import { eventSchema } from '../services/qdn/schemas/eventSchema';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

const OWNER = QUC_SYSOP_ADDRESS;
const OWNER_NAME = 'iffi_vaba_mees';
const FOREIGN = 'QForeignForeignForeignForeignAbCd';

const setAuth = (
  address: string,
  name: string,
  role: 'User' | 'Admin' | 'SysOp',
) => {
  store.dispatch(
    initializeAuth.fulfilled(
      {
        address,
        name,
        names: [name],
        role,
        balance: 0,
        bridgeAvailable: true,
      },
      'event-test',
      undefined,
    ),
  );
};

const eventMeta = (entityId: string) => ({
  name: OWNER_NAME,
  service: 'DOCUMENT',
  identifier: `qucp-event-${entityId}`,
  created: 1700000000000,
  updated: 1700000000000,
});

const eventPayload = (
  entityId: string,
  overrides?: Partial<Record<string, unknown>>,
) => ({
  schemaVersion: 1,
  resourceFamily: 'qucp-event',
  entityId,
  title: 'Test Event',
  category: 'Community',
  description: 'Event details',
  startDate: 1700000000000,
  ownerName: OWNER_NAME,
  ownerAddress: OWNER,
  createdAt: 1700000000000,
  revision: 1,
  status: 'active',
  ...overrides,
});

describe('event API round-trip', () => {
  let bridge: MockQdnBridge;

  beforeEach(() => {
    store.dispatch(eventApi.util.resetApiState());
    bridge = installMockQdnBridge();
  });

  afterEach(() => {
    bridge.cleanup();
    store.dispatch(eventApi.util.resetApiState());
  });

  it('creates a canonical qucp-event resource', async () => {
    setAuth(OWNER, OWNER_NAME, 'SysOp');

    const result = await store.dispatch(
      eventApi.endpoints.createEvent.initiate({
        title: 'Launch Party',
        category: 'Community',
        description: '[b]Join us[/b]',
        startDate: 1700000000000,
        endDate: 1700003600000,
        location: 'Tallinn',
        qdnUrl: 'qdn://DOCUMENT/Alice/agenda',
      }),
    );

    expect(result).toHaveProperty('data');
    expect(bridge.published).toHaveLength(1);
    const published = bridge.published[0];
    expect(published.service).toBe('DOCUMENT');
    expect(published.identifier).toMatch(/^qucp-event-ev-/);
    expect(published.payload.resourceFamily).toBe('qucp-event');
    expect(published.payload.status).toBe('active');
    expect(published.payload.revision).toBe(1);
    expect(published.payload.ownerName).toBe(OWNER_NAME);
    expect(published.payload.ownerAddress).toBe(OWNER);
    expect(eventSchema.safeParse(published.payload).success).toBe(true);
  });

  it('rejects event creation for a non-admin User', async () => {
    setAuth(OWNER, OWNER_NAME, 'User');

    const result = await store.dispatch(
      eventApi.endpoints.createEvent.initiate({
        title: 'Hijack',
        category: 'Community',
        description: 'No',
        startDate: 1700000000000,
      }),
    );

    expect(result).toHaveProperty('error');
    expect(bridge.published).toHaveLength(0);
  });

  it('rejects an event with a non-qdn destination before publishing', async () => {
    setAuth(OWNER, OWNER_NAME, 'SysOp');

    const result = await store.dispatch(
      eventApi.endpoints.createEvent.initiate({
        title: 'Bad Link',
        category: 'Community',
        description: 'Details',
        startDate: 1700000000000,
        qdnUrl: 'https://example.com',
      }),
    );

    expect(result).toHaveProperty('error');
    expect(bridge.published).toHaveLength(0);
  });

  it('edits an event and preserves immutable fields', async () => {
    bridge.cleanup();
    bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-event-ev-edit0001') return [eventMeta('ev-edit0001')];
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === 'qucp-event-ev-edit0001') return eventPayload('ev-edit0001');
        return null;
      },
    });
    setAuth(OWNER, OWNER_NAME, 'SysOp');

    const result = await store.dispatch(
      eventApi.endpoints.updateEvent.initiate({
        entityId: 'ev-edit0001',
        expectedRevision: 1,
        title: 'Edited Title',
        category: 'Governance',
        description: 'New details',
        startDate: 1700003600000,
      }),
    );

    expect(result).toHaveProperty('data');
    const published = bridge.published.find((p) => p.identifier === 'qucp-event-ev-edit0001');
    expect(published).toBeDefined();
    expect(published?.payload.revision).toBe(2);
    expect(published?.payload.title).toBe('Edited Title');
    expect(published?.payload.entityId).toBe('ev-edit0001');
    expect(published?.payload.ownerName).toBe(OWNER_NAME);
    expect(published?.payload.ownerAddress).toBe(OWNER);
    expect(published?.payload.createdAt).toBe(1700000000000);
  });

  it('allows a cross-publisher edit by an authorized Admin/SysOp', async () => {
    bridge.cleanup();
    bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-event-ev-owned01') return [eventMeta('ev-owned01')];
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === 'qucp-event-ev-owned01') return eventPayload('ev-owned01');
        return null;
      },
    });
    setAuth(FOREIGN, 'ForeignName', 'SysOp');

    const result = await store.dispatch(
      eventApi.endpoints.updateEvent.initiate({
        entityId: 'ev-owned01',
        expectedRevision: 1,
        title: 'Hijack',
        category: 'Community',
        description: 'No',
        startDate: 1700000000000,
      }),
    );

    expect(result).toHaveProperty('data');
    const published = bridge.published.find(
      (p) => p.identifier === 'qucp-event-ev-owned01',
    );
    expect(published).toBeDefined();
    expect(published?.payload.ownerName).toBe('ForeignName');
    expect(published?.payload.ownerAddress).toBe(FOREIGN);
  });

  it('archives an event through the canonical lifecycle', async () => {
    bridge.cleanup();
    bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-event-ev-archive01') return [eventMeta('ev-archive01')];
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === 'qucp-event-ev-archive01') return eventPayload('ev-archive01');
        return null;
      },
    });
    setAuth(OWNER, OWNER_NAME, 'SysOp');

    const result = await store.dispatch(
      eventApi.endpoints.archiveEvent.initiate({
        entityId: 'ev-archive01',
        expectedRevision: 1,
      }),
    );

    expect(result).toHaveProperty('data');
    const published = bridge.published.find((p) => p.identifier === 'qucp-event-ev-archive01');
    expect(published?.payload.status).toBe('archived');
    expect(published?.payload.revision).toBe(2);
  });

  it('rejects updating an archived event', async () => {
    bridge.cleanup();
    bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-event-ev-done0001') return [eventMeta('ev-done0001')];
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === 'qucp-event-ev-done0001') return eventPayload('ev-done0001', { status: 'archived' });
        return null;
      },
    });
    setAuth(OWNER, OWNER_NAME, 'SysOp');

    const result = await store.dispatch(
      eventApi.endpoints.updateEvent.initiate({
        entityId: 'ev-done0001',
        expectedRevision: 1,
        title: 'Update archived',
        category: 'Community',
        description: 'No',
        startDate: 1700000000000,
      }),
    );

    expect(result).toHaveProperty('error');
    expect(bridge.published).toHaveLength(0);
  });

  it('reads back validated active and archived events', async () => {
    bridge.cleanup();
    bridge = installMockQdnBridge({
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-event-') {
          return [eventMeta('ev-live0001'), eventMeta('ev-old00001')];
        }
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === 'qucp-event-ev-live0001') return eventPayload('ev-live0001', { title: 'Live Event' });
        if (payload.identifier === 'qucp-event-ev-old00001') return eventPayload('ev-old00001', { title: 'Old Event', status: 'archived' });
        return null;
      },
    });
    setAuth(OWNER, OWNER_NAME, 'SysOp');

    const result = await store.dispatch(eventApi.endpoints.getEvents.initiate(OWNER));

    expect(result).toHaveProperty('data');
    const events = (result.data as EventListResult).events;
    expect(events.map((e) => e.entityId).sort()).toEqual(['ev-live0001', 'ev-old00001']);
    expect(events.find((e) => e.entityId === 'ev-old00001')?.status).toBe('archived');
    expect(events.find((e) => e.entityId === 'ev-live0001')?.status).toBe('active');
    expect(events.find((e) => e.entityId === 'ev-live0001')?.startDateMs).toBe(1700000000000);
    expect(events.find((e) => e.entityId === 'ev-live0001')?.isOwner).toBe(true);
  });
});
