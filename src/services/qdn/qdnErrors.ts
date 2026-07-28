// ===== QDN & Bridge Typed Errors =====
//
// Typed error classes replacing raw exception propagation.
// Bridge-unavailable, user rejection, timeout, and cancellation
// are distinguishable from each other and from request failure.

/** Error codes for bridge and QDN infrastructure failures. */
export type BridgeErrorCode =
  | 'BRIDGE_UNAVAILABLE'
  | 'USER_REJECTED'
  | 'REQUEST_FAILED'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'CANCELLED';

export type QdnErrorCode =
  | BridgeErrorCode
  | 'RESOURCE_UNAVAILABLE'
  | 'PUBLICATION_FAILED';

/**
 * Base error for bridge and QDN infrastructure failures.
 * Use this instead of raw Error for typed catch handling.
 */
export class BridgeError extends Error {
  public readonly code: BridgeErrorCode;

  constructor(code: BridgeErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'BridgeError';
  }

  static bridgeUnavailable(): BridgeError {
    return new BridgeError(
      'BRIDGE_UNAVAILABLE',
      'QDN request bridge is not available. Open this app inside Qortium Home.',
    );
  }

  static userRejected(): BridgeError {
    return new BridgeError(
      'USER_REJECTED',
      'The request was rejected by the user.',
    );
  }

  static requestFailed(detail?: string): BridgeError {
    return new BridgeError(
      'REQUEST_FAILED',
      detail ? `QDN request failed: ${detail}` : 'QDN request failed.',
    );
  }

  static invalidResponse(detail?: string): BridgeError {
    return new BridgeError(
      'INVALID_RESPONSE',
      detail
        ? `Invalid QDN response: ${detail}`
        : 'Invalid QDN response received.',
    );
  }

  static timeout(ms: number): BridgeError {
    return new BridgeError(
      'TIMEOUT',
      `QDN request timed out after ${ms}ms.`,
    );
  }

  static cancelled(): BridgeError {
    return new BridgeError('CANCELLED', 'QDN request was cancelled.');
  }
}

/**
 * QDN-specific error covering resource and publication failures
 * in addition to the bridge-level codes.
 */
export class QdnError extends Error {
  public readonly code: QdnErrorCode;

  constructor(code: QdnErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'QdnError';
  }

  static resourceUnavailable(
    service: string,
    name: string,
    identifier: string,
  ): QdnError {
    return new QdnError(
      'RESOURCE_UNAVAILABLE',
      `QDN resource ${service}/${name}/${identifier} is unavailable.`,
    );
  }

  static publicationFailed(detail?: string): QdnError {
    return new QdnError(
      'PUBLICATION_FAILED',
      detail
        ? `QDN publication failed: ${detail}`
        : 'QDN publication failed.',
    );
  }
}

/**
 * Type guard: check if an error is a BridgeError.
 */
export function isBridgeError(err: unknown): err is BridgeError {
  return err instanceof BridgeError;
}

/**
 * Type guard: check if an error is a QdnError.
 */
export function isQdnError(err: unknown): err is QdnError {
  return err instanceof QdnError;
}
