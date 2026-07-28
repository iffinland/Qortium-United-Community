// ===== Moderation State Types =====
//
// Separate state dimensions for moderation effects.
// Each dimension is independently managed — unrelated actions
// do not overwrite each other.

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpModerationOperation } from '../schemas/moderationOperationSchema';

// ---- Moderation State Dimensions ----

export interface ModerationState {
  /** Content visibility: hidden by moderator vs visible. */
  visibility: 'visible' | 'hidden';

  /** Discussion locked (immutable) vs unlocked. */
  locked: boolean;

  /** Content featured vs not featured. */
  featured: boolean;

  /** Support ticket closed vs open. */
  closed: boolean;

  /** Support ticket resolved vs unresolved. */
  resolved: boolean;
}

/** Neutral state — no moderation applied. */
export const NEUTRAL_MODERATION_STATE: ModerationState = {
  visibility: 'visible',
  locked: false,
  featured: false,
  closed: false,
  resolved: false,
};

// ---- Effective Moderation Operation ----

export interface EffectiveModeration {
  operation: QdnResourceEnvelope<QucpModerationOperation>;
  authorized: boolean;
  authSource?: 'current' | 'last-known-good';
}

// ---- Owner Tombstone + Moderation Composition ----

/**
 * Combined state representing both owner deletion and moderation.
 * These dimensions are independent:
 *   - Owner delete ≠ moderator hide
 *   - Moderator restore cannot undo owner deletion
 *   - Owner restore cannot undo moderator hide
 */
export interface EntityVisibilityState {
  /** Deletion by owner (via tombstone). */
  ownerDeleted: boolean;

  /** Moderation visibility. */
  moderation: ModerationState;

  /** Computed effective visibility. */
  effectiveVisibility: 'visible' | 'hidden' | 'deleted';
}

/**
 * Compose owner tombstone state with moderation state.
 */
export function composeVisibility(
  ownerDeleted: boolean,
  moderation: ModerationState,
): EntityVisibilityState {
  let effectiveVisibility: EntityVisibilityState['effectiveVisibility'];

  if (ownerDeleted) {
    effectiveVisibility = 'deleted'; // Owner deletion overrides all
  } else if (moderation.visibility === 'hidden') {
    effectiveVisibility = 'hidden';
  } else {
    effectiveVisibility = 'visible';
  }

  return {
    ownerDeleted,
    moderation,
    effectiveVisibility,
  };
}
