// ===== QDN Diagnostics =====
//
// Lightweight structured diagnostics for the QDN foundation.
// Diagnostics are testable, do not expose secrets, and are
// independent of UI rendering decisions.

export interface QdnDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  service?: string;
  name?: string;
  identifier?: string;
  timestamp?: number;
}

/**
 * Create an info-level diagnostic.
 */
export function infoDiag(
  code: string,
  message: string,
  meta?: Partial<Pick<QdnDiagnostic, 'service' | 'name' | 'identifier'>>,
): QdnDiagnostic {
  return {
    level: 'info',
    code,
    message,
    timestamp: Date.now(),
    ...meta,
  };
}

/**
 * Create a warning-level diagnostic.
 */
export function warningDiag(
  code: string,
  message: string,
  meta?: Partial<Pick<QdnDiagnostic, 'service' | 'name' | 'identifier'>>,
): QdnDiagnostic {
  return {
    level: 'warning',
    code,
    message,
    timestamp: Date.now(),
    ...meta,
  };
}

/**
 * Create an error-level diagnostic.
 */
export function errorDiag(
  code: string,
  message: string,
  meta?: Partial<Pick<QdnDiagnostic, 'service' | 'name' | 'identifier'>>,
): QdnDiagnostic {
  return {
    level: 'error',
    code,
    message,
    timestamp: Date.now(),
    ...meta,
  };
}

/**
 * Convert a diagnostic to a plain object safe for logging.
 * Strips any accidentally attached sensitive data.
 */
export function sanitizeDiag(diag: QdnDiagnostic): Record<string, unknown> {
  return {
    level: diag.level,
    code: diag.code,
    message: diag.message,
    service: diag.service,
    name: diag.name,
    identifier: diag.identifier,
    timestamp: diag.timestamp,
  };
}
