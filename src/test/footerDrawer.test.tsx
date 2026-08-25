// Focused behaviour test for the collapsible footer drawer.
// Keeps the test intentionally small: it verifies the public keyboard/ARIA
// contract rather than cosmetic animation values.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from '../components/layout/Footer';

describe('Footer drawer', () => {
  afterEach(() => {
    cleanup();
  });

  it('starts closed with an explicit open handle', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    const handle = screen.getByRole('button', { name: /open footer panel/i });
    const panel = screen.getByTestId('quc-footer-panel');

    expect(handle).toBeInTheDocument();
    expect(handle).toHaveAttribute('aria-expanded', 'false');
    expect(handle).toHaveAttribute('aria-controls', 'quc-footer-panel');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });

  it('toggles to open and exposes the drawer content state', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    const handle = screen.getByRole('button', { name: /open footer panel/i });
    fireEvent.click(handle);

    expect(handle).toHaveAccessibleName(/close footer panel/i);
    expect(handle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('quc-footer-panel')).toHaveAttribute(
      'aria-hidden',
      'false',
    );
    expect(screen.getAllByText(/Qortium United Community/i).length).toBeGreaterThan(0);
  });
});
