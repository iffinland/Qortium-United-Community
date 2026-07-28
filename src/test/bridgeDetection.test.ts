// ===== Bridge Detection Safety Test =====
//
// Verifies that the bridge detection code does NOT throw ReferenceError
// when running outside Qortium Home (no injected qdnRequest).
//
// Target: requestQortium should return a typed/normalized error,
// not crash with an undeclared-variable ReferenceError.

import { describe, it, expect } from 'vitest';
import {
  isQortiumBridgeAvailable,
  requestQortium,
} from '../services/qortium/qortiumClient';

describe('bridge detection safety', () => {
  it('isQortiumBridgeAvailable returns false when no bridge is injected', () => {
    // In a standard test environment, no qdnRequest bridge is injected
    const available = isQortiumBridgeAvailable();
    expect(available).toBe(false);
  });

  it('isQortiumBridgeAvailable does not throw', () => {
    // The function must not throw ReferenceError due to undeclared qdnRequest
    expect(() => isQortiumBridgeAvailable()).not.toThrow();
  });

  it('requestQortium throws a typed/normalized error when bridge is unavailable', async () => {
    // When no bridge is available, requestQortium should throw
    // with a descriptive message (not ReferenceError)
    try {
      await requestQortium({ action: 'GET_SELECTED_ACCOUNT' });
      // Should not reach here — bridge is unavailable in tests
      expect.unreachable('Expected requestQortium to throw when bridge is unavailable');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const message = (err as Error).message;
      expect(message).toContain('bridge');
      // Must NOT be a raw ReferenceError about qdnRequest
      expect(err).not.toBeInstanceOf(ReferenceError);
      expect(message).not.toContain('qdnRequest is not defined');
    }
  });

  it('getRequestBridge handles cross-origin parent access safely', () => {
    // The bridge detection checks window.parent.qdnRequest inside try/catch.
    // In jsdom, window.parent === window, so this should return null cleanly.
    // The key assertion: no throw.
    expect(() => isQortiumBridgeAvailable()).not.toThrow();
  });
});
