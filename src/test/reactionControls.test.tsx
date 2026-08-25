// ===== Reaction Controls Removed for BETA =====

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '../store';
import HomePage from '../pages/HomePage';
import PostDetailPage from '../pages/PostDetailPage';
import { qortiumApi } from '../store/api/qortiumApi';

const OWNER = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

const postMetadata = {
  name: 'Alice',
  service: 'DOCUMENT',
  identifier: 'qucp-post-post0001',
  created: 1700000000000,
  updated: 1700000000000,
};

const postPayload = {
  schemaVersion: 1,
  resourceFamily: 'qucp-post',
  entityId: 'post0001',
  title: 'A valid post',
  content: 'Post body',
  summary: 'Post body',
  tags: [],
  ownerName: 'Alice',
  ownerAddress: OWNER,
  createdAt: 1700000000000,
};

const bridge = vi.fn(async (payload: Record<string, unknown>) => {
  const action = payload.action;

  if (action === 'GET_NAME_DATA') return { owner: OWNER };

  if (action === 'SEARCH_QDN_RESOURCES') {
    if (payload.identifier === 'qucp-post-') return [postMetadata];
    return [];
  }

  if (action === 'FETCH_QDN_RESOURCE') {
    if (payload.identifier === 'qucp-post-post0001') return postPayload;
    return null;
  }

  return undefined;
});

describe('reaction controls disabled for BETA', () => {
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
    store.dispatch(qortiumApi.util.resetApiState());
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('HomePage does not expose a fake Like action or fabricated count', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByText('A valid post', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTitle('Like')).toBeNull();
    expect(screen.queryByTitle('Unlike')).toBeNull();
    expect(screen.queryByText(/likes/)).toBeNull();
  });

  it('PostDetailPage does not expose a fake Like action or fabricated count', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/post/post0001']}>
          <Routes>
            <Route path="/post/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByText('A valid post', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTitle('Like')).toBeNull();
    expect(screen.queryByTitle('Unlike')).toBeNull();
    expect(screen.queryByText(/likes/)).toBeNull();
  });
});
