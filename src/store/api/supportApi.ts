// ===== Support RTK Query API =====
// Uses SEARCH_QDN_RESOURCES pattern.

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { fetchQdnJson, requestQortium } from '../../services/qortium/qortiumClient';
import { publishJsonResource } from '../../services/qortium/qdnService';
import type { Ticket } from '../../types/support';

const QDN_SERVICE = 'DOCUMENT';

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
};

export const supportApi = createApi({
  reducerPath: 'supportApi', baseQuery: fakeBaseQuery<string>(), tagTypes: ['Tickets'],
  endpoints: (builder) => ({
    getTickets: builder.query<Ticket[], void>({ queryFn: () => queryFn(async () => { const results = await requestQortium<unknown[]>({ action: 'SEARCH_QDN_RESOURCES', service: QDN_SERVICE, identifier: 'ticket-', prefix: true, mode: 'ALL', reverse: true, limit: 50 }); if (!Array.isArray(results)) return []; const tickets: Ticket[] = []; for (const item of results) { if (!item || typeof item !== 'object') continue; const r = item as Record<string,unknown>; const n = typeof r.name === 'string' ? r.name : ''; const id = typeof r.identifier === 'string' ? r.identifier : ''; if (!n || !id) continue; try { const t = await fetchQdnJson<Ticket>(QDN_SERVICE, n, id); if (t && typeof t === 'object' && t.id) tickets.push(t); } catch { /* skip */ } } return tickets; }), providesTags: ['Tickets'] }),
    getTicket: builder.query<Ticket, string>({ queryFn: (ticketId) => queryFn(async () => { const results = await requestQortium<unknown[]>({ action: 'SEARCH_QDN_RESOURCES', service: QDN_SERVICE, identifier: 'ticket-' + ticketId, prefix: false, limit: 5 }); if (!Array.isArray(results) || results.length === 0) throw new Error('Not found'); const r = results[0] as Record<string,unknown>; const n = typeof r.name === 'string' ? r.name : ''; const id = typeof r.identifier === 'string' ? r.identifier : ''; const t = await fetchQdnJson<Ticket>(QDN_SERVICE, n, id); if (!t?.id) throw new Error('Not found'); return t; }), providesTags: (_r,_e,ticketId) => [{ type: 'Tickets', id: ticketId }] }),
    createTicket: builder.mutation<Ticket, { title: string; description: string; type?: string; priority?: string; authorName: string; authorAddress: string }>({ queryFn: async (input) => { try { const ticket: Ticket = { id: 'sup-' + Date.now(), title: input.title, description: input.description, type: (input.type as Ticket['type']) || 'general', status: 'open', priority: (input.priority as Ticket['priority']) || 'medium', authorName: input.authorName, authorAddress: input.authorAddress, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), responses: [] }; await publishJsonResource({ service: 'DOCUMENT', identifier: 'ticket-' + ticket.id, payload: ticket, title: ticket.title, filename: 'ticket-' + ticket.id + '.json' }); return { data: ticket }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; } }, invalidatesTags: ['Tickets'] }),
    addResponse: builder.mutation<Ticket, { ticketId: string; content: string; authorName: string; authorAddress: string; isOfficial?: boolean }>({ queryFn: async (input) => { try { const resp = { id: 'sr-' + Date.now(), ticketId: input.ticketId, authorName: input.authorName, authorAddress: input.authorAddress, content: input.content, createdAt: new Date().toISOString(), isOfficial: input.isOfficial ?? false }; await publishJsonResource({ service: 'DOCUMENT', identifier: 'ticket-resp-' + resp.id, payload: resp, title: 'Response to ' + input.ticketId, filename: 'resp-' + resp.id + '.json' }); const ticket: Ticket = { id: input.ticketId, title: '', description: '', type: 'general', status: 'open', priority: 'medium', authorName: '', authorAddress: '', createdAt: '', updatedAt: new Date().toISOString(), responses: [resp] }; return { data: ticket }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; } }, invalidatesTags: (_r,_e,{ ticketId }) => [{ type: 'Tickets', id: ticketId }] }),
    updateTicketStatus: builder.mutation<Ticket, { ticketId: string; status: 'open' | 'in-progress' | 'resolved' | 'closed' }>({ queryFn: async (_input) => { try { return { data: { id: _input.ticketId, title: '', description: '', type: 'general', status: _input.status, priority: 'medium', authorName: '', authorAddress: '', createdAt: '', updatedAt: new Date().toISOString(), responses: [] } }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; } }, invalidatesTags: (_r,_e,{ ticketId }) => [{ type: 'Tickets', id: ticketId }] }),
  }),
});

export const { useGetTicketsQuery, useGetTicketQuery, useCreateTicketMutation, useAddResponseMutation, useUpdateTicketStatusMutation } = supportApi;
