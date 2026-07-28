// ===== Role Capabilities =====
//
// Explicit capability mapping from roles to executable actions.
// Defined in trusted application code — NOT in the registry payload.
// The registry only assigns roles; capabilities are hard-coded here.

import type { QucpRole } from '../schemas/roleRegistrySnapshotSchema';

// ---- Capability Enum ----

export type QucpCapability =
  | 'manage-roles'
  | 'moderate-content'
  | 'manage-support'
  | 'feature-content'
  | 'lock-discussions';

/** All recognized capabilities. */
export const ALL_CAPABILITIES: readonly QucpCapability[] = [
  'manage-roles',
  'moderate-content',
  'manage-support',
  'feature-content',
  'lock-discussions',
];

// ---- Role → Capability Mapping ----

/**
 * Each role grants a fixed set of capabilities.
 * The SysOp trust anchor receives all capabilities (not from registry).
 */
export const ROLE_CAPABILITIES: Record<QucpRole, readonly QucpCapability[]> = {
  admin: ['manage-roles', 'moderate-content', 'manage-support', 'feature-content', 'lock-discussions'],
  moderator: ['moderate-content', 'lock-discussions'],
  support: ['manage-support'],
};

// ---- Action → Required Capability ----

export const MODERATION_ACTION_CAPABILITIES: Record<string, QucpCapability> = {
  hide: 'moderate-content',
  restore: 'moderate-content',
  lock: 'lock-discussions',
  unlock: 'lock-discussions',
  feature: 'feature-content',
  unfeature: 'feature-content',
  close: 'manage-support',
  reopen: 'manage-support',
  'mark-resolved': 'manage-support',
  'mark-unresolved': 'manage-support',
};

/**
 * Get the required capability for a moderation action.
 */
export function getRequiredCapability(action: string): QucpCapability | null {
  return (MODERATION_ACTION_CAPABILITIES as Record<string, QucpCapability>)[action] ?? null;
}
