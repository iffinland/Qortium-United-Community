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
import { buildRoleSnapshotIdentifier } from '../services/qdn/identifiers/roleSnapshotIdentifiers';
import { buildModerationIdentifier } from '../services/qdn/identifiers/moderationIdentifiers';

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

const unavailableTicketMetadata = {
  name: 'Bebop',
  service: 'DOCUMENT',
  identifier: 'qucp-support-ticket-unavailable001',
  created: 1783760659077,
};

const roleSnapshotPayload = {
  schemaVersion: 1 as const,
  resourceFamily: 'qucp-role-snapshot' as const,
  snapshotId: 'snapshot-001',
  sysopAddress: OWNER,
  members: [],
  createdAt: 1783760659000,
};
const roleSnapshotIdentifier = await buildRoleSnapshotIdentifier(roleSnapshotPayload.snapshotId);
const roleSnapshotMetadata = {
  name: 'Alice',
  service: 'DOCUMENT',
  identifier: roleSnapshotIdentifier,
  created: 1783760659000,
};
const moderationPayload = {
  schemaVersion: 1 as const,
  resourceFamily: 'qucp-moderation' as const,
  operationId: 'mod-hide-00001',
  targetFamily: 'qucp-support-ticket' as const,
  targetEntityId: 'ticket001',
  action: 'hide' as const,
  actorName: 'Alice',
  actorAddress: OWNER,
  registrySnapshotId: roleSnapshotPayload.snapshotId,
  registrySnapshotIdentifier: roleSnapshotIdentifier,
  reason: 'Unavailable ticket',
  createdAt: 1783760660000,
};
const moderationIdentifier = await buildModerationIdentifier(
  moderationPayload.targetFamily,
  moderationPayload.targetEntityId,
  moderationPayload.operationId,
  moderationPayload.actorAddress,
  moderationPayload.action,
  moderationPayload.registrySnapshotId,
);
const moderationMetadata = {
  name: 'Alice',
  service: 'DOCUMENT',
  identifier: moderationIdentifier,
  created: 1783760660000,
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
    expect(screen.getByText(/Before opening a support ticket/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wiki' })).toHaveAttribute('href', '/wiki');
    expect(screen.getByRole('link', { name: 'Forum' })).toHaveAttribute('href', '/forum');
    expect(screen.queryByText(/Some resources could not be loaded/)).not.toBeInTheDocument();
  });

  it('renders available tickets promptly without a board-wide warning for one unavailable ticket', async () => {
    const partialBridge = vi.fn(async (payload: Record<string, unknown>) => {
      const action = payload.action;

      if (action === 'GET_NAME_DATA') return { owner: OWNER };
      if (action === 'SEARCH_QDN_RESOURCES') {
        if (payload.identifier === 'qucp-support-ticket-') {
          return [ticketMetadata, unavailableTicketMetadata];
        }
        return [];
      }
      if (action === 'FETCH_QDN_RESOURCE') {
        if (payload.identifier === ticketMetadata.identifier) return ticketPayload;
        if (payload.identifier === unavailableTicketMetadata.identifier) {
          return new Promise<never>(() => {});
        }
        return null;
      }
      return undefined;
    });
    vi.stubGlobal('qdnRequest', partialBridge);

    const startedAt = performance.now();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/support']}>
          <SupportPage />
        </MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByText('A valid ticket', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(performance.now() - startedAt).toBeLessThan(3500);
    expect(screen.queryByText(/Some resources could not be loaded/)).not.toBeInTheDocument();
  });

  it('keeps the board-wide warning for legitimate discovery incompleteness', async () => {
    const incompleteBridge = vi.fn(async (payload: Record<string, unknown>) => {
      const action = payload.action;
      if (action === 'GET_NAME_DATA') return { owner: OWNER };
      if (action === 'SEARCH_QDN_RESOURCES') {
        if (payload.identifier === 'qucp-support-ticket-') return [ticketMetadata];
        if (payload.identifier === 'qucp-support-category-') {
          throw new Error('Category discovery unavailable');
        }
        return [];
      }
      if (action === 'FETCH_QDN_RESOURCE' && payload.identifier === ticketMetadata.identifier) {
        return ticketPayload;
      }
      return null;
    });
    vi.stubGlobal('qdnRequest', incompleteBridge);

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/support']}>
          <SupportPage />
        </MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByText('A valid ticket')).toBeInTheDocument();
    expect(screen.getByText(/Some resources could not be loaded/)).toBeInTheDocument();
  });

  it('applies an authorized moderation hide to a Support ticket', async () => {
    const moderatedBridge = vi.fn(async (payload: Record<string, unknown>) => {
      const action = payload.action;
      if (action === 'GET_NAME_DATA') return { owner: OWNER };
      if (action === 'SEARCH_QDN_RESOURCES') {
        if (payload.identifier === 'qucp-rs-') return [roleSnapshotMetadata];
        if (payload.identifier === 'qucp-m-') return [moderationMetadata];
        if (payload.identifier === 'qucp-support-ticket-') return [ticketMetadata];
        return [];
      }
      if (action === 'FETCH_QDN_RESOURCE') {
        if (payload.identifier === roleSnapshotIdentifier) return roleSnapshotPayload;
        if (payload.identifier === moderationIdentifier) return moderationPayload;
        if (payload.identifier === ticketMetadata.identifier) return ticketPayload;
        return null;
      }
      return undefined;
    });
    vi.stubGlobal('qdnRequest', moderatedBridge);

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/support']}>
          <SupportPage />
        </MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByText('No tickets found.')).toBeInTheDocument();
    expect(screen.queryByText('A valid ticket')).not.toBeInTheDocument();
    expect(screen.queryByText(/Some resources could not be loaded/)).not.toBeInTheDocument();
  });

  it('publishes an authorized append-only hide operation for a Support ticket', async () => {
    let publishedIdentifier = '';
    let publishedPayload: Record<string, unknown> | null = null;
    const mutationBridge = vi.fn(async (payload: Record<string, unknown>) => {
      const action = payload.action;
      if (action === 'GET_SELECTED_ACCOUNT') return { address: OWNER };
      if (action === 'GET_ACCOUNT_NAMES') return ['Alice'];
      if (action === 'GET_NAME_DATA') return { owner: OWNER };
      if (action === 'SEARCH_QDN_RESOURCES') {
        if (payload.identifier === 'qucp-rs-') return [roleSnapshotMetadata];
        return [];
      }
      if (action === 'FETCH_QDN_RESOURCE') {
        if (payload.identifier === roleSnapshotIdentifier) return roleSnapshotPayload;
        if (payload.identifier === publishedIdentifier) return publishedPayload;
        return null;
      }
      if (action === 'PUBLISH_QDN_RESOURCE') {
        publishedIdentifier = String(payload.identifier);
        publishedPayload = JSON.parse(atob(String(payload.data64))) as Record<string, unknown>;
        return true;
      }
      return undefined;
    });
    vi.stubGlobal('qdnRequest', mutationBridge);

    await store.dispatch(supportApi.endpoints.moderateTicketVisibility.initiate({
      entityId: 'unavailable001',
      action: 'hide',
      actorName: 'Alice',
      actorAddress: OWNER,
      reason: 'Unavailable ticket',
    })).unwrap();

    expect(publishedIdentifier).toMatch(/^qucp-m-/);
    expect(publishedPayload).toMatchObject({
      resourceFamily: 'qucp-moderation',
      targetFamily: 'qucp-support-ticket',
      targetEntityId: 'unavailable001',
      action: 'hide',
      actorName: 'Alice',
      actorAddress: OWNER,
      registrySnapshotId: roleSnapshotPayload.snapshotId,
      registrySnapshotIdentifier: roleSnapshotIdentifier,
      reason: 'Unavailable ticket',
    });
    expect(mutationBridge.mock.calls.some((call) => call[0]?.action === 'PUBLISH_QDN_RESOURCE')).toBe(true);
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
