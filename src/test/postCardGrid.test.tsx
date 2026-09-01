// ===== Home Posts Card Grid Composition =====
//
// Verifies the Posts list is rendered through the shared responsive card grid
// primitive rather than a single vertical column, while preserving the
// existing title/author/date/tag surfaces and load-more behavior.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '../store';
import HomePage from '../pages/HomePage';
import { qortiumApi } from '../store/api/qortiumApi';

const OWNER = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

const postMetadata = (id: string) => ({
  name: 'Alice',
  service: 'DOCUMENT',
  identifier: `qucp-post-${id}`,
  created: 1700000000000,
  updated: 1700000000000,
});

const postPayload = (id: string, title: string) => ({
  schemaVersion: 1,
  resourceFamily: 'qucp-post',
  entityId: id,
  title,
  content: `Body for ${title}`,
  summary: `Body for ${title}`,
  tags: [],
  ownerName: 'Alice',
  ownerAddress: OWNER,
  createdAt: 1700000000000,
});

const ids = ['post0001', 'post0002', 'post0003', 'post0004', 'post0005', 'post0006'];

const bridge = vi.fn(async (payload: Record<string, unknown>) => {
  const action = payload.action;

  if (action === 'GET_NAME_DATA') return { owner: OWNER };

  if (action === 'SEARCH_QDN_RESOURCES') {
    if (payload.identifier === 'qucp-post-') {
      return ids.map((id) => postMetadata(id));
    }
    return [];
  }

  if (action === 'FETCH_QDN_RESOURCE') {
    const identifier = String(payload.identifier ?? '');
    const id = identifier.replace('qucp-post-', '');
    if (ids.includes(id)) return postPayload(id, `Post ${id}`);
    return null;
  }

  return undefined;
});

describe('Home posts card grid', () => {
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

  it('renders posts through the shared responsive card grid', async () => {
    const { container } = render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByText('Post post0001', {}, { timeout: 5000 })).toBeInTheDocument();

    const grid = container.querySelector('.quc-card-grid');
    expect(grid).not.toBeNull();
    expect(grid?.querySelectorAll('article')).toHaveLength(5);

    for (const id of ids.slice(0, 5)) {
      expect(screen.getByText(`Post ${id}`)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /load more \(1 remaining\)/i })).toBeInTheDocument();
  });

  it('keeps navigation links and metadata intact on each card', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      </Provider>,
    );

    const firstTitle = await screen.findByText('Post post0001', {}, { timeout: 5000 });
    expect(firstTitle.closest('a')).toHaveAttribute('href', '/post/post0001');
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
  });
});
