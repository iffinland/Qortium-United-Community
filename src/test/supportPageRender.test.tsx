// Regression render test for the Support list page.
// Exercises the production SupportPage against the actual RTK Query API with a
// mocked qdnRequest bridge so render-time crashes are not hidden by empty data.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '../store';
import SupportPage from '../pages/SupportPage';
import { supportApi } from '../store/api/supportApi';
import App from '../App';

const OWNER = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

const ticketMetadata = {
  name: 'Alice',
  service: 'DOCUMENT',
  identifier: 'qucp-support-ticket-ticket001',
  created: 1783760659076,
  updated: 1783760659076,
};

const ticketPayload = {
  schemaVersion: 1,
  resourceFamily: 'qucp-support-ticket',
  entityId: 'ticket001',
  title: 'A valid ticket',
  description: 'Details',
  type: 'bug',
  userPriority: 'medium',
  categoryId: 'category001',
  ownerName: 'Alice',
  ownerAddress: OWNER,
  createdAt: 1783760659076,
};

const pollMetadata = {
  name: 'Alice',
  service: 'DOCUMENT',
  identifier: 'poll-poll-1783761442252',
  created: 1783761444005,
};

const pollPayload = {
  id: 'poll-1783761442252',
  question: 'What the pest using name - unifed or united?',
  options: [
    { id: 'opt-1', label: 'unifed', voteCount: 0 },
    { id: 'opt-2', label: 'united', voteCount: 0 },
  ],
  totalVotes: 0,
  closesAt: '2026-07-31T09:17:00.000Z',
  createdBy: 'Admin',
  createdAt: '2026-07-11T09:17:22.253Z',
};

const bridge = vi.fn(async (payload: Record<string, unknown>) => {
  const action = payload.action;

  if (action === 'GET_NAME_DATA') {
    return { owner: OWNER };
  }
  console.log('BRIDGE', action, payload.identifier, payload.service);

  if (action === 'SEARCH_QDN_RESOURCES') {
    if (payload.identifier === 'qucp-support-ticket-') {
      return [ticketMetadata];
    }
    return [];
  }

  if (action === 'FETCH_QDN_RESOURCE') {
    if (payload.identifier === 'qucp-support-ticket-ticket001') {
      return ticketPayload;
    }
    return null;
  }

  return undefined;
});

const fullBridge = vi.fn(async (payload: Record<string, unknown>) => {
  const action = payload.action;

  if (action === 'GET_SELECTED_ACCOUNT') return { address: OWNER };
  if (action === 'GET_ACCOUNT_NAMES') return ['Alice'];
  if (action === 'GET_BALANCE') return 0;
  if (action === 'GET_NAME_DATA') return { owner: OWNER };
  if (action === 'FETCH_NODE_API') return [];

  if (action === 'SEARCH_QDN_RESOURCES') {
    if (payload.identifier === 'qucp-support-ticket-') return [ticketMetadata];
    if (payload.identifier === 'poll-') return [pollMetadata];
    return [];
  }

  if (action === 'FETCH_QDN_RESOURCE') {
    if (payload.identifier === 'qucp-support-ticket-ticket001') return ticketPayload;
    if (payload.identifier === 'poll-poll-1783761442252') return pollPayload;
    return null;
  }

  return undefined;
});

describe('SupportPage render safety', () => {
  beforeEach(() => {
    vi.stubGlobal('qdnRequest', bridge);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    store.dispatch(supportApi.util.resetApiState());
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders a valid ticket without crashing', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/support']}>
          <SupportPage />
        </MemoryRouter>
      </Provider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await screen.findByText('A valid ticket')).toBeInTheDocument();
    expect(bridge.mock.calls.some((call) => call[0]?.action === 'GET_NAME_DATA')).toBe(true);
  });

  it('renders the Support route inside the full App with bridge data', async () => {
    vi.stubGlobal('qdnRequest', fullBridge);
    window.history.pushState({}, '', '/support');

    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );

    expect(await screen.findByText('A valid ticket', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
