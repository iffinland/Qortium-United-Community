// ===== Auth Initialization Canonical Role Path Test =====

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchRole: vi.fn(),
}));

vi.mock('../services/auth/authorization', () => ({
  fetchAuthoritativeUserRole: (...args: unknown[]) => mocks.fetchRole(...args),
}));

vi.mock('../services/qortium/qortiumClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/qortium/qortiumClient')>()),
  isQortiumBridgeAvailable: () => true,
}));

vi.mock('../services/qortium/walletService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/qortium/walletService')>()),
  getUserAccount: async () => ({
    address: 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    name: 'Alice',
    names: ['Alice'],
  }),
  getAccountNames: async () => ['Alice'],
  getAccountBalance: async () => 100,
}));

import { store } from '../store';
import { initializeAuth } from '../store/slices/authSlice';

describe('initializeAuth', () => {
  beforeEach(() => {
    mocks.fetchRole.mockReset();
  });

  it('resolves the production role through the canonical role helper', async () => {
    mocks.fetchRole.mockResolvedValue('Admin');

    await store.dispatch(initializeAuth());

    expect(mocks.fetchRole).toHaveBeenCalledWith('QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(store.getState().auth.role).toBe('Admin');
    expect(store.getState().auth.isAuthenticated).toBe(true);
  });

  it('fails closed to User when no privileged role is resolved', async () => {
    mocks.fetchRole.mockResolvedValue('User');

    await store.dispatch(initializeAuth());

    expect(store.getState().auth.role).toBe('User');
    expect(store.getState().auth.isAuthenticated).toBe(true);
  });
});
