// ===== Qortium Wallet / Account Service =====

import { requestQortium } from './qortiumClient';
import type { UserAccount } from '../../types';

interface AccountNameResponse {
  name?: string;
}

const ACCOUNT_CACHE_TTL_MS = 5 * 60 * 1000;
const NAME_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedValue<T> = { value: T; cachedAt: number };

const accountCache: { value: UserAccount | null; cachedAt: number } = {
  value: null,
  cachedAt: 0,
};
let accountInflight: Promise<UserAccount> | null = null;

const nameAddressCache = new Map<string, CachedValue<string | null>>();
const nameAddressInflight = new Map<string, Promise<string | null>>();

const isFresh = (cachedAt: number, ttlMs: number) =>
  Date.now() - cachedAt < ttlMs;

const readNumericBalance = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object' && value !== null) {
    const rec = value as Record<string, unknown>;
    for (const key of ['value', 'balance', 'amount']) {
      const parsed = readNumericBalance(rec[key]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
};

/**
 * Get the currently selected Qortium account.
 */
export const getUserAccount = async (): Promise<UserAccount> => {
  if (accountCache.value && isFresh(accountCache.cachedAt, ACCOUNT_CACHE_TTL_MS)) {
    return accountCache.value;
  }

  if (accountInflight) return accountInflight;

  accountInflight = requestQortium<UserAccount>({
    action: 'GET_SELECTED_ACCOUNT',
  })
    .then((account) => {
      const raw = account as unknown as Record<string, unknown>;
      const result: UserAccount = {
        address: (typeof raw.address === 'string' && raw.address) || '',
        name: null,
        names: [],
      };

      accountCache.value = result;
      accountCache.cachedAt = Date.now();
      return result;
    })
    .finally(() => {
      accountInflight = null;
    });

  return accountInflight;
};

/**
 * Get registered names for a wallet address.
 */
export const getAccountNames = async (address: string): Promise<string[]> => {
  const normalized = address.trim();
  if (!normalized) return [];

  const cached = nameAddressCache.get(normalized);
  if (cached && isFresh(cached.cachedAt, NAME_CACHE_TTL_MS))
    return cached.value ? [cached.value] : [];

  if (nameAddressInflight.has(normalized))
    return nameAddressInflight.get(normalized)!.then((v) => (v ? [v] : []));

  const promise = requestQortium<unknown>({
    action: 'GET_ACCOUNT_NAMES',
    address: normalized,
  }).then((raw) => {
    const names = Array.isArray(raw)
      ? raw
          .map((entry) => {
            if (typeof entry === 'string') return entry;
            if (typeof entry === 'object' && entry !== null)
              return (entry as AccountNameResponse).name ?? null;
            return null;
          })
          .filter((n): n is string => Boolean(n && n.trim()))
      : [];

    const name = names[0] ?? null;
    nameAddressCache.set(normalized, { value: name, cachedAt: Date.now() });
    return name;
  });

  nameAddressInflight.set(normalized, promise);
  return promise.then((v) => (v ? [v] : []));
};

/**
 * Get the QORT coin balance for an address.
 */
export const getAccountBalance = async (
  address: string
): Promise<number | null> => {
  try {
    const response = await requestQortium<unknown>({
      action: 'GET_BALANCE',
      address,
    });
    return readNumericBalance(response);
  } catch {
    return null;
  }
};

/**
 * Resolve a Qortium name to its wallet address.
 */
export const resolveNameToAddress = async (
  name: string
): Promise<string | null> => {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const key = trimmed.toLowerCase();
  const cached = nameAddressCache.get(key);
  if (cached && isFresh(cached.cachedAt, NAME_CACHE_TTL_MS))
    return cached.value;

  if (nameAddressInflight.has(key)) return nameAddressInflight.get(key)!;

  const promise = requestQortium<{ owner?: string; ownerAddress?: string }>({
    action: 'GET_NAME_DATA',
    name: trimmed,
  }).then((response) => {
    const address =
      response?.ownerAddress || response?.owner || null;
    nameAddressCache.set(key, { value: address, cachedAt: Date.now() });
    return address;
  });

  nameAddressInflight.set(key, promise);
  return promise;
};
