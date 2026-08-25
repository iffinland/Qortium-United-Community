// ===== R-HIGH-3: Support Admin-Close Boundary Includes Role History =====
//
// Exercises the production `getTicket` composition: Support-status discovery is
// not enough to declare an Admin-authorized close authoritative. When role
// history is degraded and a role-dependent close may exist, the boundary must
// degrade, replies must be quarantined, and the ticket must not be presented as
// safely Open.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { store } from '../store';
import { supportApi } from '../store/api/supportApi';
import { initializeAuth } from '../store/slices/authSlice';
import { buildSupportTicketCloseIdentifier } from '../services/qdn/identifiers/operationIdentifiers';
import { buildRoleSnapshotIdentifier } from '../services/qdn/identifiers/roleSnapshotIdentifiers';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';

const SYSOP = QUC_SYSOP_ADDRESS;
const OWNER = 'QOwnerAddressOwnerAddressOwnerAddre';
const ADMIN = 'QAdminAddressAdminAddressAdminAdd';
const TICKET_ID = 'ticket001';
const TICKET_IDENTIFIER = `qucp-support-ticket-${TICKET_ID}`;

const T0 = 1700000000000;

const ticketMetadata = {
  name: 'Alice',
  service: 'DOCUMENT',
  identifier: TICKET_IDENTIFIER,
  created: T0,
  updated: T0,
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
  createdAt: T0,
};

const replyPayload = (entityId: string, createdAt: number) => ({
  schemaVersion: 1,
  resourceFamily: 'qucp-ticket-reply',
  entityId,
  parentEntityId: TICKET_ID,
  content: 'Reply content',
  ownerName: 'Alice',
  ownerAddress: OWNER,
  createdAt,
});

const closePayload = (operationId: string, actorName: string, actorAddress: string, createdAt: number) => ({
  schemaVersion: 1,
  resourceFamily: 'qucp-support-ticket-status',
  operationId,
  targetFamily: 'qucp-support-ticket',
  targetEntityId: TICKET_ID,
  actorName,
  actorAddress,
  action: 'close',
  createdAt,
});

const nameData = (name: string) => {
  if (name === 'Alice') return { owner: OWNER };
  if (name === 'AdminName') return { owner: ADMIN };
  if (name === 'iffi_vaba_mees') return { owner: SYSOP };
  return null;
};

const setAuth = () => {
  store.dispatch(
    initializeAuth.fulfilled(
      {
        address: OWNER,
        name: 'Alice',
        names: ['Alice'],
        role: 'User',
        balance: 0,
        bridgeAvailable: true,
      },
      'test-request',
      undefined,
    ),
  );
};

describe('R-HIGH-3: Support Admin-close role-history completeness', () => {
  let bridge: MockQdnBridge;

  beforeEach(() => {
    store.dispatch(supportApi.util.resetApiState());
    setAuth();
  });

  afterEach(() => {
    bridge?.cleanup();
    store.dispatch(supportApi.util.resetApiState());
  });

  it('Admin close + healthy role lineage -> Closed', async () => {
    const roleId = await buildRoleSnapshotIdentifier('rs-genesis');
    const closeId = await buildSupportTicketCloseIdentifier('qucp-support-ticket', TICKET_ID, ADMIN);
    const closeTime = T0 + 1000;

    bridge = installMockQdnBridge({
      selectedAccount: OWNER,
      ownerName: 'Alice',
      nameData,
      searchResults: (payload) => {
        const id = String(payload.identifier);
        if (id === 'qucp-support-ticket-') return [ticketMetadata];
        if (id === 'qucp-ticket-reply-') return [];
        if (id === 'qucp-support-category-') return [];
        if (id === 'qucp-rs-') {
          return [{ name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier: roleId, created: T0, updated: T0 }];
        }
        if (id === 'qucp-stc-') {
          return [{ name: 'AdminName', service: 'DOCUMENT', identifier: closeId, created: closeTime, updated: closeTime }];
        }
        return [];
      },
      fetch: (payload) => {
        const id = String(payload.identifier);
        if (id === TICKET_IDENTIFIER) return ticketPayload;
        if (id === roleId) {
          return {
            schemaVersion: 1,
            resourceFamily: 'qucp-role-snapshot',
            snapshotId: 'rs-genesis',
            sysopAddress: SYSOP,
            members: [{ address: ADMIN, roles: ['admin'] }],
            createdAt: T0,
          };
        }
        if (id === closeId) return closePayload('stc-close', 'AdminName', ADMIN, closeTime);
        return null;
      },
    });

    const result = await store.dispatch(supportApi.endpoints.getTicket.initiate(TICKET_ID));
    const data = (result as { data?: { ticket: { status: string; closeBoundaryDegraded?: boolean; responses: unknown[] } } }).data;
    expect(data?.ticket.status).toBe('Closed');
    expect(data?.ticket.closeBoundaryDegraded).not.toBe(true);
    expect(data?.ticket.responses).toHaveLength(0);
  });

  it('Admin close + unavailable role lineage -> degraded boundary, not Open, replies quarantined', async () => {
    const closeId = await buildSupportTicketCloseIdentifier('qucp-support-ticket', TICKET_ID, ADMIN);
    const closeTime = T0 + 1000;
    const replyId = 'tr-post-close';
    const replyTime = T0 + 2000;

    bridge = installMockQdnBridge({
      selectedAccount: OWNER,
      ownerName: 'Alice',
      nameData,
      searchResults: (payload) => {
        const id = String(payload.identifier);
        if (id === 'qucp-support-ticket-') return [ticketMetadata];
        if (id === 'qucp-ticket-reply-') {
          return [{ name: 'Alice', service: 'DOCUMENT', identifier: `qucp-ticket-reply-${replyId}`, created: replyTime, updated: replyTime }];
        }
        if (id === 'qucp-support-category-') return [];
        if (id === 'qucp-rs-') {
          throw new Error('role search down');
        }
        if (id === 'qucp-stc-') {
          return [{ name: 'AdminName', service: 'DOCUMENT', identifier: closeId, created: closeTime, updated: closeTime }];
        }
        return [];
      },
      fetch: (payload) => {
        const id = String(payload.identifier);
        if (id === TICKET_IDENTIFIER) return ticketPayload;
        if (id === `qucp-ticket-reply-${replyId}`) return replyPayload(replyId, replyTime);
        if (id === closeId) return closePayload('stc-close', 'AdminName', ADMIN, closeTime);
        return null;
      },
    });

    const result = await store.dispatch(supportApi.endpoints.getTicket.initiate(TICKET_ID));
    const data = (result as {
      data?: {
        ticket: { status: string; closeBoundaryDegraded?: boolean; responses: unknown[] };
        completeness: string;
      };
    }).data;
    expect(data?.ticket.closeBoundaryDegraded).toBe(true);
    expect(data?.ticket.responses).toHaveLength(0);
    expect(data?.completeness).toBe('incomplete');
  });

  it('Admin close + ambiguous role lineage -> degraded boundary', async () => {
    const roleA = await buildRoleSnapshotIdentifier('rs-genesis-a');
    const roleB = await buildRoleSnapshotIdentifier('rs-genesis-b');
    const closeId = await buildSupportTicketCloseIdentifier('qucp-support-ticket', TICKET_ID, ADMIN);
    const closeTime = T0 + 1000;

    bridge = installMockQdnBridge({
      selectedAccount: OWNER,
      ownerName: 'Alice',
      nameData,
      searchResults: (payload) => {
        const id = String(payload.identifier);
        if (id === 'qucp-support-ticket-') return [ticketMetadata];
        if (id === 'qucp-ticket-reply-') return [];
        if (id === 'qucp-support-category-') return [];
        if (id === 'qucp-rs-') {
          return [
            { name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier: roleA, created: T0, updated: T0 },
            { name: 'iffi_vaba_mees', service: 'DOCUMENT', identifier: roleB, created: T0 + 1, updated: T0 + 1 },
          ];
        }
        if (id === 'qucp-stc-') {
          return [{ name: 'AdminName', service: 'DOCUMENT', identifier: closeId, created: closeTime, updated: closeTime }];
        }
        return [];
      },
      fetch: (payload) => {
        const id = String(payload.identifier);
        if (id === TICKET_IDENTIFIER) return ticketPayload;
        if (id === roleA || id === roleB) {
          return {
            schemaVersion: 1,
            resourceFamily: 'qucp-role-snapshot',
            snapshotId: id === roleA ? 'rs-genesis-a' : 'rs-genesis-b',
            sysopAddress: SYSOP,
            members: [{ address: ADMIN, roles: ['admin'] }],
            createdAt: T0,
          };
        }
        if (id === closeId) return closePayload('stc-close', 'AdminName', ADMIN, closeTime);
        return null;
      },
    });

    const result = await store.dispatch(supportApi.endpoints.getTicket.initiate(TICKET_ID));
    const data = (result as { data?: { ticket: { status: string; closeBoundaryDegraded?: boolean; responses: unknown[] } } }).data;
    expect(data?.ticket.closeBoundaryDegraded).toBe(true);
  });

  it('author close remains Closed even when role history is degraded', async () => {
    const closeId = await buildSupportTicketCloseIdentifier('qucp-support-ticket', TICKET_ID, OWNER);
    const closeTime = T0 + 1000;
    const replyId = 'tr-post-close-author';
    const replyTime = T0 + 2000;

    bridge = installMockQdnBridge({
      selectedAccount: OWNER,
      ownerName: 'Alice',
      nameData,
      searchResults: (payload) => {
        const id = String(payload.identifier);
        if (id === 'qucp-support-ticket-') return [ticketMetadata];
        if (id === 'qucp-ticket-reply-') {
          return [{ name: 'Alice', service: 'DOCUMENT', identifier: `qucp-ticket-reply-${replyId}`, created: replyTime, updated: replyTime }];
        }
        if (id === 'qucp-support-category-') return [];
        if (id === 'qucp-rs-') throw new Error('role search down');
        if (id === 'qucp-stc-') {
          return [{ name: 'Alice', service: 'DOCUMENT', identifier: closeId, created: closeTime, updated: closeTime }];
        }
        return [];
      },
      fetch: (payload) => {
        const id = String(payload.identifier);
        if (id === TICKET_IDENTIFIER) return ticketPayload;
        if (id === `qucp-ticket-reply-${replyId}`) return replyPayload(replyId, replyTime);
        if (id === closeId) return closePayload('stc-close', 'Alice', OWNER, closeTime);
        return null;
      },
    });

    const result = await store.dispatch(supportApi.endpoints.getTicket.initiate(TICKET_ID));
    const data = (result as { data?: { ticket: { status: string; closeBoundaryDegraded?: boolean; responses: unknown[] } } }).data;
    expect(data?.ticket.status).toBe('Closed');
    expect(data?.ticket.closeBoundaryDegraded).not.toBe(true);
    expect(data?.ticket.responses).toHaveLength(0);
  });
});
