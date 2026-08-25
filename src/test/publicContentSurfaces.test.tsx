// ===== Public Content Surface Regression Tests =====
//
// Verifies the public Projects/Polls/Wiki surfaces no longer expose create or
// management controls after Admin-panel centralization.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '../store';
import PollsPage from '../pages/PollsPage';
import WikiPage from '../pages/WikiPage';
import ProjectsPage from '../pages/ProjectsPage';
import { pollApi } from '../store/api/pollApi';
import { wikiApi } from '../store/api/wikiApi';
import { projectApi } from '../store/api/projectApi';
import { installMockQdnBridge, type MockQdnBridge } from './helpers/mockQdnBridge';

describe('public content surfaces', () => {
  let bridge: MockQdnBridge;

  beforeEach(() => {
    store.dispatch(pollApi.util.resetApiState());
    store.dispatch(wikiApi.util.resetApiState());
    store.dispatch(projectApi.util.resetApiState());
    bridge = installMockQdnBridge();
  });

  afterEach(() => {
    cleanup();
    bridge.cleanup();
  });

  it('Polls page has no create or close controls', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/polls']}>
          <PollsPage />
        </MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByRole('heading', { name: /polls & surveys/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new poll/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish poll/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });

  it('Wiki page has no create-article action', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/wiki']}>
          <WikiPage />
        </MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByRole('heading', { name: /wiki/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /create article/i })).not.toBeInTheDocument();
  });

  it('Projects page has no create-project action', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/projects']}>
          <ProjectsPage />
        </MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByText(/no projects have been added yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new project/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create project/i })).not.toBeInTheDocument();
  });
});
