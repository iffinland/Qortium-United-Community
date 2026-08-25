// Focused unified-theme test: the app must not expose a light/dark toggle and
// must keep the document root on the single built-in theme.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../store';
import App from '../App';

describe('unified theme', () => {
  beforeEach(() => {
    localStorage.removeItem('quc-theme');
    document.documentElement.classList.remove('dark');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('qdnRequest', vi.fn(async () => undefined));
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('quc-theme');
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not render a light/dark toggle', () => {
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );

    expect(
      screen.queryByTitle('Switch to dark mode'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTitle('Switch to light mode'),
    ).not.toBeInTheDocument();
  });

  it('keeps the document root on the single theme', () => {
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );

    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('quc-theme')).toBeNull();
  });
});
