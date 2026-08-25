// ===== M3 Account-Switch State Tests =====
//
// Prove that selected-account changes refresh account-scoped identity,
// publisher name, and caches using Qortium Home's `qortium:selected-account-changed`
// signal, and that publisher/identity caches are not keyed globally.

import { describe, it, expect, afterEach } from 'vitest';
import { listenForAccountChanges } from '../services/qortium/accountChangeListener';
import { getOwnerName } from '../services/qortium/qortiumClient';
import {
  getUserAccount,
  invalidateAccountScopedCaches,
} from '../services/qortium/walletService';

const ADDR_A = 'QAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = 'QBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function installBridge(selected: () => string, names: (addr: string) => string[]) {
  const handler = async (payload: Record<string, unknown>): Promise<unknown> => {
    const action = payload.action;
    if (action === 'GET_SELECTED_ACCOUNT') {
      return { address: selected(), name: names(selected())[0] ?? null };
    }
    if (action === 'GET_ACCOUNT_NAMES') {
      return names(payload.address as string);
    }
    return undefined;
  };

  const anyGlobal = globalThis as typeof globalThis & { qdnRequest?: unknown };
  const anyWindow = window as Window & { qdnRequest?: unknown };
  anyGlobal.qdnRequest = handler;
  anyWindow.qdnRequest = handler;

  return () => {
    delete anyGlobal.qdnRequest;
    delete anyWindow.qdnRequest;
  };
}

describe('M3 account change listener', () => {
  it('reacts to the Home selected-account-change message', () => {
    const calls: string[] = [];
    const off = listenForAccountChanges(() => calls.push('changed'));

    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'qortium:selected-account-changed' } }),
    );
    expect(calls).toEqual(['changed']);

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'other' } }));
    expect(calls).toEqual(['changed']);

    off();
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'qortium:selected-account-changed' } }),
    );
    expect(calls).toEqual(['changed']);
  });
});

describe('M3 account-scoped publisher name', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('publisher name follows the selected account', async () => {
    let selected = ADDR_A;
    const names = (addr: string) => (addr === ADDR_A ? ['Alice'] : ['Bob']);
    cleanup = installBridge(() => selected, names);

    await expect(getOwnerName()).resolves.toBe('Alice');

    selected = ADDR_B;
    await expect(getOwnerName()).resolves.toBe('Bob');

    // Returning to the first account must not reuse the other account's name.
    selected = ADDR_A;
    await expect(getOwnerName()).resolves.toBe('Alice');
  });
});

describe('M3 account-scoped identity cache', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('invalidation removes stale selected-account identity', async () => {
    let selected = ADDR_A;
    cleanup = installBridge(() => selected, () => []);

    const first = await getUserAccount();
    expect(first.address).toBe(ADDR_A);

    // Without invalidation the global selected-account cache is stale.
    selected = ADDR_B;
    const stale = await getUserAccount();
    expect(stale.address).toBe(ADDR_A);

    // The account-change handler must invalidate before refreshing.
    invalidateAccountScopedCaches();
    const refreshed = await getUserAccount();
    expect(refreshed.address).toBe(ADDR_B);
  });
});
