// ===== Support Ticket Close Lifecycle Tests =====

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { store } from '../store';
import { supportApi } from '../store/api/supportApi';
import { initializeAuth } from '../store/slices/authSlice';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import {
  authorizeSupportTicketCloseActor,
  buildSupportTicketClosePayload,
  buildSupportRoleContext,
  reduceSupportTicketStatuses,
  type SupportTicketTargetOwner,
} from '../services/qdn/runtime/supportTicketStatusRuntime';
import type { QucpSupportTicketStatus } from '../services/qdn/schemas/supportTicketStatusSchema';
import { supportTicketStatusSchema } from '../services/qdn/schemas/supportTicketStatusSchema';
import type { QucpRoleRegistrySnapshot } from '../services/qdn/schemas/roleRegistrySnapshotSchema';
import type { QdnResourceEnvelope } from '../services/qdn/QdnResourceEnvelope';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

const OWNER = 'QOwnerAddressOwnerAddressOwnerAddre';
const ADMIN = 'QAdminAddressAdminAddressAdminAdd';
const OTHER = 'QOtherAddressOtherAddressOtherAdd';
const TICKET_ID = 'ticket001';
const TICKET_IDENTIFIER = `qucp-support-ticket-${TICKET_ID}`;

const targetOwner: SupportTicketTargetOwner = {
  ownerName: 'Alice',
  ownerAddress: OWNER,
  entityId: TICKET_ID,
  resourceFamily: 'qucp-support-ticket',
};

function snapshot(
  members: QucpRoleRegistrySnapshot['members'],
  createdAt = 1700000000000,
): QucpRoleRegistrySnapshot {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-role-snapshot',
    snapshotId: 'snap-001',
    sysopAddress: QUC_SYSOP_ADDRESS,
    members,
    createdAt,
  };
}

function roleContextFor(
  members: QucpRoleRegistrySnapshot['members'],
): ReturnType<typeof buildSupportRoleContext> {
  const snap = snapshot(members);
  return buildSupportRoleContext({
    status: 'complete',
    items: [
      {
        envelope: {
          metadata: {
            name: 'Qortian',
            service: 'DOCUMENT',
            identifier: 'qucp-rs-aaaaaaaaaaaaaaaaaaaaaaaaaa',
            created: 1700000000000,
            updated: 1700000000000,
          },
          data: snap,
          resolvedPublisherAddress: QUC_SYSOP_ADDRESS,
        },
        entityId: 'snap-001',
        publisherName: 'Qortian',
        publisherAddress: QUC_SYSOP_ADDRESS,
      },
    ],
    rejectedCount: 0,
    quarantinedCount: 0,
    diagnostics: [],
  } as unknown as Parameters<typeof buildSupportRoleContext>[0]);
}

function closeOperation(
  actorAddress: string,
  actorName: string,
  created = 1700001000000,
): QucpSupportTicketStatus & { __envelopeCreated?: number } {
  return {
    schemaVersion: 1,
    resourceFamily: 'qucp-support-ticket-status',
    operationId: `stc-close-${actorAddress.slice(-6)}`,
    targetFamily: 'qucp-support-ticket',
    targetEntityId: TICKET_ID,
    actorName,
    actorAddress,
    action: 'close',
    createdAt: created,
    __envelopeCreated: created,
  } as QucpSupportTicketStatus & { __envelopeCreated?: number };
}

function envelopeFor(op: QucpSupportTicketStatus & { __envelopeCreated?: number }) {
  return {
    metadata: {
      name: op.actorName,
      service: 'DOCUMENT',
      identifier: `qucp-stc-targettargettargettargett-${op.actorAddress.slice(-6)}`,
      created: op.__envelopeCreated ?? op.createdAt,
      updated: op.__envelopeCreated ?? op.createdAt,
    },
    data: op,
    resolvedPublisherAddress: op.actorAddress,
  };
}

describe('support ticket close authorization', () => {
  it('does not define a reopen action', () => {
    const reopen = buildSupportTicketClosePayload({
      operationId: 'stc-reopen-0001',
      targetEntityId: TICKET_ID,
      actorName: 'Alice',
      actorAddress: OWNER,
    });
    (reopen as { action: string }).action = 'reopen';
    const parsed = supportTicketStatusSchema.safeParse(reopen);
    expect(parsed.success).toBe(false);
  });

  it('author can close own ticket', () => {
    const result = authorizeSupportTicketCloseActor({
      actorAddress: OWNER,
      actorName: 'Alice',
      targetOwner,
      operationQdnCreatedTime: 1700001000000,
      roleContext: roleContextFor([]),
    });
    expect(result.authorized).toBe(true);
    if (result.authorized) expect(result.source).toBe('author');
  });

  it('SysOp can close any ticket', () => {
    const result = authorizeSupportTicketCloseActor({
      actorAddress: QUC_SYSOP_ADDRESS,
      actorName: 'Qortian',
      targetOwner,
      operationQdnCreatedTime: 1700001000000,
      roleContext: roleContextFor([]),
    });
    expect(result.authorized).toBe(true);
    if (result.authorized) expect(result.source).toBe('sysop-trust-anchor');
  });

  it('Admin can close any ticket with an effective role snapshot', () => {
    const result = authorizeSupportTicketCloseActor({
      actorAddress: ADMIN,
      actorName: 'Admin Person',
      targetOwner,
      operationQdnCreatedTime: 1700002000000,
      roleContext: roleContextFor([{ address: ADMIN, roles: ['admin'] }]),
    });
    expect(result.authorized).toBe(true);
    if (result.authorized) expect(result.source).toBe('admin-at-publication');
  });

  it('unrelated User cannot close someone else ticket', () => {
    const result = authorizeSupportTicketCloseActor({
      actorAddress: OTHER,
      actorName: 'Other User',
      targetOwner,
      operationQdnCreatedTime: 1700002000000,
      roleContext: roleContextFor([]),
    });
    expect(result.authorized).toBe(false);
  });
});

describe('support ticket status reduction', () => {
  it('is Open with no authorized operations', () => {
    const reduced = reduceSupportTicketStatuses(targetOwner, [], roleContextFor([]));
    expect(reduced.status).toBe('Open');
    expect(reduced.authorized).toBe(false);
  });

  it('is Closed after any authorized close operation', () => {
    const op = closeOperation(OWNER, 'Alice');
    const reduced = reduceSupportTicketStatuses(
      targetOwner,
      [envelopeFor(op) as unknown as QdnResourceEnvelope<QucpSupportTicketStatus>],
      roleContextFor([]),
    );
    expect(reduced.status).toBe('Closed');
    expect(reduced.authorized).toBe(true);
  });

  it('ignores close operations from unauthorized users', () => {
    const op = closeOperation(OTHER, 'Other User');
    const reduced = reduceSupportTicketStatuses(
      targetOwner,
      [envelopeFor(op) as unknown as QdnResourceEnvelope<QucpSupportTicketStatus>],
      roleContextFor([]),
    );
    expect(reduced.status).toBe('Open');
  });
});

describe('support close API round-trip', () => {
  let bridge: MockQdnBridge;

  const ticketMetadata = {
    name: 'Alice',
    service: 'DOCUMENT',
    identifier: TICKET_IDENTIFIER,
    created: 1783760659076,
    updated: 1783760659076,
  };

  const ticketPayload = {
    schemaVersion: 1,
    resourceFamily: 'qucp-support-ticket',
    entityId: TICKET_ID,
    title: 'A valid ticket',
    description: 'Details',
    type: 'bug',
    userPriority: 'medium',
    categoryId: 'category001',
    ownerName: 'Alice',
    ownerAddress: OWNER,
    createdAt: 1783760659076,
  };

  const setAuth = (address: string, name: string, role: 'User' | 'Admin' | 'SysOp') => {
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
        'test-request',
        undefined,
      ),
    );
  };

  beforeEach(() => {
    store.dispatch(supportApi.util.resetApiState());
    bridge = installMockQdnBridge({
      selectedAccount: OWNER,
      ownerName: 'Alice',
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-support-ticket-') return [ticketMetadata];
        if (payload.identifier === 'qucp-ticket-reply-') return [];
        if (payload.identifier === 'qucp-support-category-') return [];
        if (payload.identifier === 'qucp-rs-') return [];
        if (payload.identifier === 'qucp-stc-') {
          return bridge.published
            .filter((p) => p.payload.resourceFamily === 'qucp-support-ticket-status')
            .map((p) => ({
              name: p.name,
              service: p.service,
              identifier: p.identifier,
              created: 1783760659076,
              updated: 1783760659076,
            }));
        }
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === TICKET_IDENTIFIER) return ticketPayload;
        return null;
      },
    });
    setAuth(OWNER, 'Alice', 'User');
  });

  afterEach(() => {
    bridge.cleanup();
    store.dispatch(supportApi.util.resetApiState());
  });

  it('author closes own ticket with a canonical close operation', async () => {
    const closeResult = await store.dispatch(
      supportApi.endpoints.closeTicket.initiate({ ticketId: TICKET_ID }),
    );

    expect(closeResult).toHaveProperty('data');
    if ('data' in closeResult && closeResult.data) {
      expect(closeResult.data.status).toBe('Closed');
    }

    const published = bridge.published.find(
      (p) => p.payload.resourceFamily === 'qucp-support-ticket-status',
    );
    expect(published).toBeTruthy();
    expect(published?.identifier).toMatch(/^qucp-stc-/);
    expect(published?.payload).toMatchObject({
      targetFamily: 'qucp-support-ticket',
      targetEntityId: TICKET_ID,
      action: 'close',
      actorAddress: OWNER,
    });

    const detailResult = await store.dispatch(
      supportApi.endpoints.getTicket.initiate(TICKET_ID),
    );
    expect(detailResult).toHaveProperty('data');
    if ('data' in detailResult && detailResult.data?.ticket) {
      expect(detailResult.data.ticket.status).toBe('Closed');
    }
  });

  it('rejects a direct reply to a closed ticket', async () => {
    await store.dispatch(
      supportApi.endpoints.closeTicket.initiate({ ticketId: TICKET_ID }),
    );

    const replyResult = await store.dispatch(
      supportApi.endpoints.addResponse.initiate({
        ticketId: TICKET_ID,
        content: 'This should be rejected',
        authorName: 'Alice',
        authorAddress: OWNER,
      }),
    );

    expect(replyResult).toHaveProperty('error');
    expect(bridge.published.filter((p) => p.payload.resourceFamily === 'qucp-ticket-reply')).toHaveLength(0);
  });
});
