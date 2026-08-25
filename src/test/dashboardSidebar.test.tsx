// ===== Dashboard Sidebar Rendering Regression =====

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '../store';
import Sidebar from '../components/layout/Sidebar';
import { qortiumApi } from '../store/api/qortiumApi';
import { projectApi } from '../store/api/projectApi';
import { pollApi } from '../store/api/pollApi';
import { wikiApi } from '../store/api/wikiApi';
import { forumApi } from '../store/api/forumApi';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

describe('dashboard sidebar', () => {
  let bridge: MockQdnBridge;

  beforeEach(() => {
    store.dispatch(qortiumApi.util.resetApiState());
    store.dispatch(projectApi.util.resetApiState());
    store.dispatch(pollApi.util.resetApiState());
    store.dispatch(wikiApi.util.resetApiState());
    store.dispatch(forumApi.util.resetApiState());
    bridge = installMockQdnBridge();
  });

  afterEach(() => {
    cleanup();
    bridge.cleanup();
  });

  it('shows only the owner-approved community stats and truthful zeros', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <Sidebar />
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('community-stats-active-projects')).toHaveTextContent('0');
      expect(screen.getByTestId('community-stats-active-polls')).toHaveTextContent('0');
      expect(screen.getByTestId('community-stats-events-this-month')).toHaveTextContent('0');
    });

    expect(screen.getByText('Active Projects')).toBeInTheDocument();
    expect(screen.getByText('Active Polls')).toBeInTheDocument();
    expect(screen.getByText('Events This Month')).toBeInTheDocument();
    expect(screen.queryByText('Members')).not.toBeInTheDocument();

    expect(screen.getByText('Active Forum Discussions')).toBeInTheDocument();
    expect(screen.getByText('No forum discussions yet.')).toBeInTheDocument();
  });

  it('keeps forum activity out of the general Recent Activity block', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <Sidebar />
        </MemoryRouter>
      </Provider>,
    );

    await screen.findByText('Active Forum Discussions');

    // With no non-forum canonical activity, the general feed must stay absent.
    expect(screen.queryByText('Recent Activity')).not.toBeInTheDocument();
  });
});
