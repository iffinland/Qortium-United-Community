// ===== Wiki Category Accordion Regression Tests =====

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '../store';
import { wikiApi } from '../store/api/wikiApi';
import WikiPage from '../pages/WikiPage';

const OWNER = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';

const article = (entityId: string) => ({
  name: 'Qortian',
  service: 'DOCUMENT',
  identifier: `qucp-wiki-${entityId}`,
  created: 1783760659076,
  updated: 1783760659076,
});

const articlePayload = (entityId: string, categoryId: string, title: string) => ({
  schemaVersion: 1,
  resourceFamily: 'qucp-wiki',
  entityId,
  categoryId,
  title,
  slug: title.toLowerCase().replaceAll(' ', '-'),
  content: `Content for ${title}`,
  summary: '',
  tags: [],
  ownerName: 'Qortian',
  ownerAddress: OWNER,
  createdAt: 1783760659076,
  revision: 1,
  status: 'active',
});

const emptyBridge = vi.fn(async (payload: Record<string, unknown>) => {
  if (payload.action === 'GET_NAME_DATA') return { owner: OWNER };
  if (payload.action === 'SEARCH_QDN_RESOURCES') return [];
  return undefined;
});

const populatedBridge = vi.fn(async (payload: Record<string, unknown>) => {
  if (payload.action === 'GET_NAME_DATA') return { owner: OWNER };
  if (payload.action === 'SEARCH_QDN_RESOURCES') {
    return [
      article('wk-guide001'),
      article('wk-dev001'),
    ];
  }
  if (payload.action === 'FETCH_QDN_RESOURCE') {
    if (payload.identifier === 'qucp-wiki-wk-guide001') {
      return articlePayload('wk-guide001', 'guides', 'First Guide');
    }
    if (payload.identifier === 'qucp-wiki-wk-dev001') {
      return articlePayload('wk-dev001', 'dev', 'Developer Handbook');
    }
    return null;
  }
  return undefined;
});

function renderPage() {
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/wiki']}>
        <WikiPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('Wiki category accordion', () => {
  beforeEach(() => {
    vi.stubGlobal('qdnRequest', emptyBridge);
  });

  afterEach(() => {
    cleanup();
    store.dispatch(wikiApi.util.resetApiState());
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('starts with every category collapsed and opens one at a time', async () => {
    renderPage();

    const gettingStarted = await screen.findByRole('button', { name: /Getting Started/ });
    expect(gettingStarted).toHaveAttribute('aria-expanded', 'false');

    const guides = screen.getByRole('button', { name: /Guides & Tutorials/ });
    await guides.click();

    expect(guides).toHaveAttribute('aria-expanded', 'true');
    expect(gettingStarted).toHaveAttribute('aria-expanded', 'false');
    expect(await screen.findByText('No articles in this category yet.')).toBeInTheDocument();
  });

  it('opening another category closes the previous one and clicking again collapses', async () => {
    renderPage();

    const gettingStarted = await screen.findByRole('button', { name: /Getting Started/ });
    const guides = screen.getByRole('button', { name: /Guides & Tutorials/ });

    await gettingStarted.click();
    expect(gettingStarted).toHaveAttribute('aria-expanded', 'true');

    await guides.click();
    expect(guides).toHaveAttribute('aria-expanded', 'true');
    expect(gettingStarted).toHaveAttribute('aria-expanded', 'false');

    await guides.click();
    expect(guides).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows articles under the correct category and keeps routing intact', async () => {
    vi.stubGlobal('qdnRequest', populatedBridge);
    renderPage();

    const guides = await screen.findByRole('button', { name: /Guides & Tutorials/ });
    await guides.click();

    const guidesPanel = screen.getByRole('region', { hidden: false });
    const guideLink = within(guidesPanel).getByRole('link', { name: /First Guide/ });
    expect(guideLink).toHaveAttribute('href', '/wiki/article/wk-guide001');

    const devButton = screen.getByRole('button', { name: /Developer Docs/ });
    await devButton.click();

    expect(screen.getByRole('link', { name: /Developer Handbook/ })).toHaveAttribute(
      'href',
      '/wiki/article/wk-dev001',
    );
    expect(screen.queryByRole('link', { name: /First Guide/ })).not.toBeInTheDocument();
  });
});
