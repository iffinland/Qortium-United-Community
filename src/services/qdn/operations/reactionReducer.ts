// ===== Reaction Reducer =====
//
// Reduces accepted reaction operations into per-target, per-actor
// effective reactions and derived counts.

import type { QdnResourceEnvelope } from '../QdnResourceEnvelope';
import type { QucpReaction } from '../schemas/reactionSchema';
import { compareByQdnMetadata } from '../ordering/authoritativeEntityOrdering';

// ---- Effective Reaction ----

export interface EffectiveReaction {
  actorWallet: string;
  targetFamily: string;
  targetEntityId: string;
  reactionType: string;
  active: boolean;
  envelope: QdnResourceEnvelope<QucpReaction>;
}

// ---- Derived Counts ----

export interface ReactionCounts {
  total: number;
  byType: Record<string, number>;
}

// ---- Wallet Deduplication ----

/**
 * Deduplicate accepted reactions by actor wallet.
 * When the same wallet publishes through multiple QDN names,
 * only the latest accepted operation per (wallet, target, type) is effective.
 */
function deduplicateByWallet(
  reactions: QdnResourceEnvelope<QucpReaction>[],
): Map<string, EffectiveReaction> {
  const byKey = new Map<string, EffectiveReaction>();

  for (const env of reactions) {
    const addr = env.data.actorAddress;
    const key = `${addr}|${env.data.targetFamily}|${env.data.targetEntityId}|${env.data.reactionType}`;
    const current = byKey.get(key);

    if (!current || compareByQdnMetadata(env, current.envelope) < 0) {
      byKey.set(key, {
        actorWallet: addr,
        targetFamily: env.data.targetFamily,
        targetEntityId: env.data.targetEntityId,
        reactionType: env.data.reactionType,
        active: env.data.active,
        envelope: env,
      });
    }
  }

  return byKey;
}

// ---- Active Reactions ----

/**
 * Get the active reactions for a target from accepted reaction operations.
 * Only reactions with active: true and from the latest operation per wallet count.
 */
export function getActiveReactions(
  targetFamily: string,
  targetEntityId: string,
  reactions: QdnResourceEnvelope<QucpReaction>[],
): EffectiveReaction[] {
  const effective = deduplicateByWallet(reactions);
  return Array.from(effective.values()).filter(
    (r) =>
      r.active &&
      r.targetFamily === targetFamily &&
      r.targetEntityId === targetEntityId,
  );
}

// ---- Derived Counts ----

/**
 * Derive reaction counts from accepted effective reactions.
 * Does NOT read from entity payload — counts are computed from operations.
 */
export function deriveReactionCounts(
  targetFamily: string,
  targetEntityId: string,
  reactions: QdnResourceEnvelope<QucpReaction>[],
): ReactionCounts {
  const active = getActiveReactions(targetFamily, targetEntityId, reactions);
  const byType: Record<string, number> = {};
  for (const r of active) {
    byType[r.reactionType] = (byType[r.reactionType] ?? 0) + 1;
  }
  return {
    total: active.length,
    byType,
  };
}
