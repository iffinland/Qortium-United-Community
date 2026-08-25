// ===== Events Page Rendering Tests =====
//
// Verifies public grouping (Upcoming / Ongoing / Past), truthful empty states,
// archived-event exclusion, RichText rendering, QDN link rendering, and the
// absence of management controls on the public surface.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '../store';
import EventsPage from '../pages/EventsPage';
import { eventApi } from '../store/api/eventApi';
import { QUC_SYSOP_ADDRESS } from '../config/qortiumTrust';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

const OWNER = QUC_SYSOP_ADDRESS;
const OWNER_NAME = 'iffi_vaba_mees';

const meta = (entityId: string) => ({
  name: OWNER_NAME,
  service: 'DOCUMENT',
  identifier: `qucp-event-${entityId}`,
  created: 1700000000000,
  updated: 1700000000000,
});

const payload = (
  entityId: string,
  overrides: Record<string, unknown>,
) => ({
  schemaVersion: 1,
  resourceFamily: 'qucp-event',
  entityId,
  title: entityId,
  category: 'Community',
  description: 'Details',
  startDate: Date.now(),
  ownerName: OWNER_NAME,
  ownerAddress: OWNER,
  createdAt: 1700000000000,
  revision: 1,
  status: 'active',
  ...overrides,
});

describe('events page', () => {
  let bridge: MockQdnBridge;

  beforeEach(() => {
    store.dispatch(eventApi.util.resetApiState());
    const now = Date.now();
    bridge = installMockQdnBridge({
      searchResults: (search) => {
        if (search.identifier === 'qucp-event-') {
          return [meta('ev-up000001'), meta('ev-past0001'), meta('ev-archived1')];
        }
        return [];
      },
      fetch: (fetchPayload) => {
        const id = fetchPayload.identifier as string;
        if (id === 'qucp-event-ev-up000001') {
          return payload('ev-up000001', {
            title: 'Launch Party',
            description: '[b]Join us[/b]',
            startDate: now + 60000,
            endDate: now + 120000,
            qdnUrl: 'qdn://DOCUMENT/Alice/agenda',
          });
        }
        if (id === 'qucp-event-ev-past0001') {
          return payload('ev-past0001', {
            title: 'Hackathon Wrap',
            startDate: now - 120000,
            endDate: now - 60000,
          });
        }
        if (id === 'qucp-event-ev-archived1') {
          return payload('ev-archived1', {
            title: 'Secret Archived Event',
            startDate: now + 60000,
            status: 'archived',
          });
        }
        return null;
      },
    });
  });

  afterEach(() => {
    cleanup();
    bridge.cleanup();
    store.dispatch(eventApi.util.resetApiState());
  });

  it('groups events, excludes archived, and shows truthful empty states', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/events']}>
          <EventsPage />
        </MemoryRouter>
      </Provider>,
    );

    const upcomingHeading = await screen.findByRole('heading', { name: /upcoming/i });
    const upcomingSection = upcomingHeading.closest('section');
    expect(upcomingSection).not.toBeNull();
    expect(within(upcomingSection!).getByText('Launch Party')).toBeInTheDocument();

    const pastHeading = screen.getByRole('heading', { name: /past/i });
    const pastSection = pastHeading.closest('section');
    expect(within(pastSection!).getByText('Hackathon Wrap')).toBeInTheDocument();

    expect(screen.getByText('No ongoing events.')).toBeInTheDocument();
    expect(screen.queryByText('Secret Archived Event')).not.toBeInTheDocument();
  });

  it('renders RichText description and a QDN link, but no management control', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/events']}>
          <EventsPage />
        </MemoryRouter>
      </Provider>,
    );

    await screen.findByRole('heading', { name: /upcoming/i });

    expect(screen.getByText('Join us')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /qdn link/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new event/i })).not.toBeInTheDocument();
  });
});
