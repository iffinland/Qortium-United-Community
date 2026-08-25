// ===== H5 Publication Confirmation Boundary Tests =====
//
// A QDN publication must be confirmed by reading back the INTENDED payload,
// not merely by observing that something readable exists at the coordinate.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  publishJsonResource,
  publishJsonResourceWithConfirmation,
  PublicationNotConfirmedError,
} from '../services/qortium/qdnService';
import { invalidateOwnerNameCache } from '../services/qortium/qortiumClient';

const WALLET = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const NAME = 'Alice';

interface BridgeOptions {
  fetchPayload: unknown;
  publishResult?: unknown;
}

function installBridge(options: BridgeOptions): () => void {
  const handler = async (payload: Record<string, unknown>): Promise<unknown> => {
    switch (payload.action) {
      case 'GET_SELECTED_ACCOUNT':
        return { address: WALLET, name: NAME };
      case 'GET_ACCOUNT_NAMES':
        return [NAME];
      case 'PUBLISH_QDN_RESOURCE':
        return options.publishResult ?? { success: true };
      case 'FETCH_QDN_RESOURCE':
        return options.fetchPayload;
      default:
        return undefined;
    }
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

const intendedPayload = {
  schemaVersion: 1,
  resourceFamily: 'qucp-post',
  entityId: 'p1',
  title: 'New title',
  content: 'New content',
  ownerName: NAME,
  ownerAddress: WALLET,
  createdAt: 1700000000000,
};

const stalePayload = {
  ...intendedPayload,
  title: 'Old title',
  content: 'Old content',
};

describe('publish confirmation verifies the intended payload', () => {
  let cleanup: () => void;

  beforeEach(() => {
    invalidateOwnerNameCache();
  });

  afterEach(() => {
    cleanup?.();
  });

  it('exact intended payload confirms the write', async () => {
    cleanup = installBridge({ fetchPayload: intendedPayload });
    const result = await publishJsonResourceWithConfirmation({
      service: 'DOCUMENT',
      identifier: 'qucp-post-p1',
      payload: intendedPayload,
      verifyRetries: 2,
      verifyDelayMs: 1,
    });
    expect(result.status).toBe('confirmed');
    expect(result.identifier).toBe('qucp-post-p1');
  });

  it('a stale prior payload does not confirm a new write', async () => {
    cleanup = installBridge({ fetchPayload: stalePayload });
    const result = await publishJsonResourceWithConfirmation({
      service: 'DOCUMENT',
      identifier: 'qucp-post-p1',
      payload: intendedPayload,
      verifyRetries: 2,
      verifyDelayMs: 1,
    });
    expect(result.status).toBe('accepted-unconfirmed');
  });

  it('accepted-but-unconfirmed state is preserved as an explicit result', async () => {
    cleanup = installBridge({ fetchPayload: null });
    const result = await publishJsonResourceWithConfirmation({
      service: 'DOCUMENT',
      identifier: 'qucp-post-p1',
      payload: intendedPayload,
      verifyRetries: 1,
      verifyDelayMs: 1,
    });
    expect(result.status).toBe('accepted-unconfirmed');
    if (result.status === 'accepted-unconfirmed') {
      expect(result.reason).toBeTruthy();
    }
  });

  it('ambiguous confirmation never becomes a false success through the throwing wrapper', async () => {
    cleanup = installBridge({ fetchPayload: stalePayload });
    await expect(
      publishJsonResource({
        service: 'DOCUMENT',
        identifier: 'qucp-post-p1',
        payload: intendedPayload,
        verifyRetries: 1,
        verifyDelayMs: 1,
      }),
    ).rejects.toBeInstanceOf(PublicationNotConfirmedError);
  });

  it('a rejected publish throws rather than reporting success', async () => {
    cleanup = installBridge({ fetchPayload: intendedPayload, publishResult: false });
    await expect(
      publishJsonResource({
        service: 'DOCUMENT',
        identifier: 'qucp-post-p1',
        payload: intendedPayload,
      }),
    ).rejects.toThrow(/rejected/i);
  });
});
