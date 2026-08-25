// ===== Repair Round 3 — M2 Bounded Bridge Timeouts =====
//
// Reads must classify timeouts truthfully. Writes/publications must remain
// ambiguous (accepted/unknown/unconfirmed) and must never be blindly retried.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requestQortium,
  WRITE_REQUEST_TIMEOUT_MS,
  invalidateOwnerNameCache,
} from '../services/qortium/qortiumClient';
import { publishJsonResourceWithConfirmation } from '../services/qortium/qdnService';
import { BridgeError } from '../services/qdn/qdnErrors';
import { paginatedQdnSearch } from '../services/qdn/paginatedQdnSearch';
import { validatedRuntimeQuery } from '../services/qdn/runtime/validatedQueryRuntime';
import { postPolicy } from '../services/qdn/policies/postPolicy';
import { IdentityResolver } from '../services/qdn/IdentityResolver';

const WALLET = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const NAME = 'Alice';

function installBridge(
  handler: (payload: Record<string, unknown>) => Promise<unknown> | unknown,
): () => void {
  const anyGlobal = globalThis as typeof globalThis & { qdnRequest?: unknown };
  const anyWindow = window as Window & { qdnRequest?: unknown };
  const wrapped = (payload: Record<string, unknown>) => handler(payload);
  anyGlobal.qdnRequest = wrapped;
  anyWindow.qdnRequest = wrapped;
  return () => {
    delete anyGlobal.qdnRequest;
    delete anyWindow.qdnRequest;
  };
}

afterEach(() => {
  invalidateOwnerNameCache();
});

describe('M2: bridge call timeouts', () => {
  it('successful read resolves before timeout', async () => {
    const cleanup = installBridge(async () => ({ ok: true }));
    try {
      const result = await requestQortium({ action: 'SEARCH_QDN_RESOURCES' }, { timeoutMs: 1000 });
      expect(result).toEqual({ ok: true });
    } finally {
      cleanup();
    }
  });

  it('stalled read throws a TIMEOUT bridge error', async () => {
    const cleanup = installBridge(() => new Promise(() => {}));
    try {
      await expect(
        requestQortium({ action: 'SEARCH_QDN_RESOURCES' }, { timeoutMs: 20 }),
      ).rejects.toMatchObject({ code: 'TIMEOUT' });
    } finally {
      cleanup();
    }
  });

  it('paginated search classifies a read timeout as timeout', async () => {
    const searchFn = async () => {
      throw BridgeError.timeout(20);
    };
    const result = await paginatedQdnSearch(searchFn, {
      service: 'DOCUMENT',
      identifier: 'qucp-post-',
    });
    expect(result.reason).toBe('timeout');
  });

  it('validated query classifies a read timeout as unavailable', async () => {
    const resolver = new IdentityResolver(async () => WALLET);
    const result = await validatedRuntimeQuery(
      async () => {
        throw BridgeError.timeout(20);
      },
      async () => ({}),
      (raw) => raw as never,
      postPolicy,
      resolver,
      { service: 'DOCUMENT', identifierPrefix: 'qucp-post-' },
    );
    expect(result.status).toBe('unavailable');
  });

  it('stalled publication returns accepted-unconfirmed and does not retry', async () => {
    const publishCalls: string[] = [];
    const cleanup = installBridge(async (payload) => {
      const action = payload.action as string;
      if (action === 'PUBLISH_QDN_RESOURCE') {
        publishCalls.push(action);
        return new Promise(() => {});
      }
      if (action === 'GET_SELECTED_ACCOUNT') {
        return { address: WALLET, name: NAME };
      }
      if (action === 'GET_ACCOUNT_NAMES') {
        return [NAME];
      }
      return undefined;
    });

    vi.useFakeTimers();
    try {
      const promise = publishJsonResourceWithConfirmation({
        service: 'DOCUMENT',
        identifier: 'qucp-post-p1',
        payload: { schemaVersion: 1, resourceFamily: 'qucp-post' },
        verifyRetries: 1,
        verifyDelayMs: 1,
      });

      await vi.advanceTimersByTimeAsync(WRITE_REQUEST_TIMEOUT_MS + 1000);
      const result = await promise;

      expect(result.status).toBe('accepted-unconfirmed');
      expect(publishCalls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      cleanup();
    }
  });

  it('recovers after a timed-out read once the bridge responds again', async () => {
    let hanging = true;
    const cleanup = installBridge(async () => {
      if (hanging) return new Promise(() => {});
      return { recovered: true };
    });

    try {
      await expect(
        requestQortium({ action: 'SEARCH_QDN_RESOURCES' }, { timeoutMs: 20 }),
      ).rejects.toMatchObject({ code: 'TIMEOUT' });

      hanging = false;
      const result = await requestQortium(
        { action: 'SEARCH_QDN_RESOURCES' },
        { timeoutMs: 1000 },
      );
      expect(result).toEqual({ recovered: true });
    } finally {
      cleanup();
    }
  });
});
