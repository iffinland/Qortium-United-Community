// ===== H6 Permanent Closed Support Boundary Tests =====
//
// The authoritative reader must reject replies whose trusted QDN publication
// time is after the first authorized close, and must fail truthfully when the
// close state cannot be determined.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { store } from '../store';
import { supportApi } from '../store/api/supportApi';
import { initializeAuth } from '../store/slices/authSlice';
import {
  evaluateTicketReplyAgainstClose,
  type SupportTicketCloseBoundary,
} from '../services/qdn/runtime/supportTicketStatusRuntime';
import { buildSupportTicketCloseIdentifier } from '../services/qdn/identifiers/operationIdentifiers';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

const OWNER = 'QOwnerAddressOwnerAddressOwnerAddre';
const TICKET_ID = 'ticket001';
const TICKET_IDENTIFIER = `qucp-support-ticket-${TICKET_ID}`;

describe('ticket reply close-boundary decision', () => {
  it('accepts a reply before the close boundary', () => {
    const boundary: SupportTicketCloseBoundary = {
      status: 'Closed',
      firstCloseQdnTime: 2000,
      discoveryComplete: true,
    };
    expect(evaluateTicketReplyAgainstClose(boundary, 1000)).toEqual({ accepted: true });
  });

  it('accepts a reply exactly at the close boundary', () => {
    const boundary: SupportTicketCloseBoundary = {
      status: 'Closed',
      firstCloseQdnTime: 2000,
      discoveryComplete: true,
    };
    expect(evaluateTicketReplyAgainstClose(boundary, 2000)).toEqual({ accepted: true });
  });

  it('rejects a reply after the close boundary', () => {
    const boundary: SupportTicketCloseBoundary = {
      status: 'Closed',
      firstCloseQdnTime: 2000,
      discoveryComplete: true,
    };
    expect(evaluateTicketReplyAgainstClose(boundary, 2001)).toEqual({
      accepted: false,
      reason: 'reply-after-close',
    });
  });

  it('rejects replies when status discovery is incomplete', () => {
    const boundary: SupportTicketCloseBoundary = {
      status: 'Closed',
      firstCloseQdnTime: 2000,
      discoveryComplete: false,
    };
    expect(evaluateTicketReplyAgainstClose(boundary, 1000)).toEqual({
      accepted: false,
      reason: 'status-discovery-incomplete',
    });
  });

  it('accepts any reply for an open ticket with complete discovery', () => {
    const boundary: SupportTicketCloseBoundary = {
      status: 'Open',
      discoveryComplete: true,
    };
    expect(evaluateTicketReplyAgainstClose(boundary, 3000)).toEqual({ accepted: true });
  });

  it('rejects a reply with missing trusted QDN time', () => {
    const boundary: SupportTicketCloseBoundary = {
      status: 'Closed',
      firstCloseQdnTime: 2000,
      discoveryComplete: true,
    };
    expect(evaluateTicketReplyAgainstClose(boundary, undefined)).toEqual({
      accepted: false,
      reason: 'reply-time-missing',
    });
  });
});

describe('support close boundary on the production reader', () => {
  let bridge: MockQdnBridge;

  const ticketMetadata = {
    name: 'Alice',
    service: 'DOCUMENT',
    identifier: TICKET_IDENTIFIER,
    created: 1700000000000,
    updated: 1700000000000,
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
    createdAt: 1700000000000,
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

  const closePayload = (operationId: string, createdAt: number) => ({
    schemaVersion: 1,
    resourceFamily: 'qucp-support-ticket-status',
    operationId,
    targetFamily: 'qucp-support-ticket',
    targetEntityId: TICKET_ID,
    actorName: 'Alice',
    actorAddress: OWNER,
    action: 'close',
    createdAt,
  });

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

  beforeEach(() => {
    store.dispatch(supportApi.util.resetApiState());
    setAuth();
  });

  afterEach(() => {
    bridge?.cleanup();
    store.dispatch(supportApi.util.resetApiState());
  });

  it('rejects a direct-QDN reply published after the authorized close', async () => {
    const closeId = await buildSupportTicketCloseIdentifier('qucp-support-ticket', TICKET_ID, OWNER);
    const closeTime = 1700000100000;
    const replyId = 'tr-post-close';
    const replyTime = 1700000200000;

    bridge = installMockQdnBridge({
      selectedAccount: OWNER,
      ownerName: 'Alice',
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-support-ticket-') return [ticketMetadata];
        if (payload.identifier === 'qucp-ticket-reply-') {
          return [{ name: 'Alice', service: 'DOCUMENT', identifier: `qucp-ticket-reply-${replyId}`, created: replyTime, updated: replyTime }];
        }
        if (payload.identifier === 'qucp-support-category-') return [];
        if (payload.identifier === 'qucp-rs-') return [];
        if (payload.identifier === 'qucp-stc-') {
          return [{ name: 'Alice', service: 'DOCUMENT', identifier: closeId, created: closeTime, updated: closeTime }];
        }
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === TICKET_IDENTIFIER) return ticketPayload;
        if (payload.identifier === `qucp-ticket-reply-${replyId}`) return replyPayload(replyId, replyTime);
        if (payload.identifier === closeId) return closePayload('stc-close', closeTime);
        return null;
      },
    });

    const result = await store.dispatch(supportApi.endpoints.getTicket.initiate(TICKET_ID));
    expect(result).toHaveProperty('data');
    const data = (result as { data?: { ticket: { status: string; responses: unknown[] } } }).data;
    expect(data?.ticket.status).toBe('Closed');
    expect(data?.ticket.responses).toHaveLength(0);
  });

  it('keeps an existing pre-close reply visible after close', async () => {
    const closeId = await buildSupportTicketCloseIdentifier('qucp-support-ticket', TICKET_ID, OWNER);
    const closeTime = 1700000100000;
    const replyId = 'tr-pre-close';
    const replyTime = 1700000050000;

    bridge = installMockQdnBridge({
      selectedAccount: OWNER,
      ownerName: 'Alice',
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-support-ticket-') return [ticketMetadata];
        if (payload.identifier === 'qucp-ticket-reply-') {
          return [{ name: 'Alice', service: 'DOCUMENT', identifier: `qucp-ticket-reply-${replyId}`, created: replyTime, updated: replyTime }];
        }
        if (payload.identifier === 'qucp-support-category-') return [];
        if (payload.identifier === 'qucp-rs-') return [];
        if (payload.identifier === 'qucp-stc-') {
          return [{ name: 'Alice', service: 'DOCUMENT', identifier: closeId, created: closeTime, updated: closeTime }];
        }
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === TICKET_IDENTIFIER) return ticketPayload;
        if (payload.identifier === `qucp-ticket-reply-${replyId}`) return replyPayload(replyId, replyTime);
        if (payload.identifier === closeId) return closePayload('stc-close', closeTime);
        return null;
      },
    });

    const result = await store.dispatch(supportApi.endpoints.getTicket.initiate(TICKET_ID));
    const data = (result as { data?: { ticket: { status: string; responses: unknown[] } } }).data;
    expect(data?.ticket.status).toBe('Closed');
    expect(data?.ticket.responses).toHaveLength(1);
  });

  it('quarantines replies when close discovery is incomplete', async () => {
    const replyId = 'tr-uncertain';
    const replyTime = 1700000200000;

    bridge = installMockQdnBridge({
      selectedAccount: OWNER,
      ownerName: 'Alice',
      searchResults: (payload) => {
        if (payload.identifier === 'qucp-support-ticket-') return [ticketMetadata];
        if (payload.identifier === 'qucp-ticket-reply-') {
          return [{ name: 'Alice', service: 'DOCUMENT', identifier: `qucp-ticket-reply-${replyId}`, created: replyTime, updated: replyTime }];
        }
        if (payload.identifier === 'qucp-support-category-') return [];
        if (payload.identifier === 'qucp-rs-') return [];
        if (payload.identifier === 'qucp-stc-') {
          // A close operation is discoverable but cannot be fetched, so status
          // discovery is incomplete.
          return [{ name: 'Alice', service: 'DOCUMENT', identifier: 'qucp-stc-incomplete', created: 1700000100000, updated: 1700000100000 }];
        }
        return [];
      },
      fetch: (payload) => {
        if (payload.identifier === TICKET_IDENTIFIER) return ticketPayload;
        if (payload.identifier === `qucp-ticket-reply-${replyId}`) return replyPayload(replyId, replyTime);
        if (payload.identifier === 'qucp-stc-incomplete') throw new Error('close fetch failed');
        return null;
      },
    });

    const result = await store.dispatch(supportApi.endpoints.getTicket.initiate(TICKET_ID));
    const data = (result as { data?: { ticket: { status: string; responses: unknown[] }; completeness: string } }).data;
    expect(data?.ticket.responses).toHaveLength(0);
    expect(data?.completeness).toBe('incomplete');
  });
});
