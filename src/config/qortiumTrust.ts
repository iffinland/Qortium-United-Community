// ===== Qortium Trust Configuration =====
//
// Single source of truth for the SysOp trust anchor.
// This wallet address is the ultimate authority for:
//   - canonical role registry validation
//   - SysOp capability assignment
//
// The address is a public wallet — not a secret.
// It MUST NOT be overridden by payloads, localStorage, or UI.

/** The configured SysOp wallet — trust anchor for role authorization. */
export const QUC_SYSOP_ADDRESS = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
