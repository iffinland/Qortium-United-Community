// ===== Dashboard Active Forum Discussions =====
//
// Pure derivation of the Active Forum Discussions block from canonical topic
// and reply views. Forum data is intentionally excluded from the general
// Recent Activity block, but is represented here as its own separate block.

export interface ForumDiscussionThreadInput {
  id: string;
  categoryId: string;
  title: string;
  /** Authoritative QDN creation timestamp in epoch milliseconds. */
  createdAtMs?: number | null;
}

export interface ForumDiscussionReplyInput {
  id: string;
  threadId: string;
  /** Authoritative QDN creation timestamp in epoch milliseconds. */
  createdAtMs?: number | null;
}

export interface ActiveForumDiscussion {
  id: string;
  categoryId: string;
  title: string;
  lastActivityAt: string;
  replyCount: number;
}

function finiteTimestamp(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value;
}

/**
 * Build the top active discussions.
 *
 * A thread's activity time is max(thread creation time, latest canonical reply
 * time). Threads with no usable authoritative timestamp are omitted because
 * they cannot be truthfully ordered. All accepted replies for a thread count
 * toward its real reply count.
 */
export function buildActiveForumDiscussions(
  threads: readonly ForumDiscussionThreadInput[],
  replies: readonly ForumDiscussionReplyInput[],
  limit = 5,
): ActiveForumDiscussion[] {
  const acceptedThreadIds = new Set(threads.map((thread) => thread.id));

  const repliesByThread = new Map<string, ForumDiscussionReplyInput[]>();
  for (const reply of replies) {
    if (!reply.threadId || !acceptedThreadIds.has(reply.threadId)) continue;
    const existing = repliesByThread.get(reply.threadId) ?? [];
    existing.push(reply);
    repliesByThread.set(reply.threadId, existing);
  }

  return threads
    .map((thread) => {
      const threadCreated = finiteTimestamp(thread.createdAtMs);
      let latestReplyMs: number | null = null;

      for (const reply of repliesByThread.get(thread.id) ?? []) {
        const replyMs = finiteTimestamp(reply.createdAtMs);
        if (replyMs !== null && (latestReplyMs === null || replyMs > latestReplyMs)) {
          latestReplyMs = replyMs;
        }
      }

      const activityMs =
        threadCreated === null
          ? latestReplyMs
          : latestReplyMs === null
            ? threadCreated
            : Math.max(threadCreated, latestReplyMs);

      if (activityMs === null) return null;

      return {
        id: thread.id,
        categoryId: thread.categoryId,
        title: thread.title,
        lastActivityMs: activityMs,
        createdAtMs: threadCreated,
        replyCount: (repliesByThread.get(thread.id) ?? []).length,
      };
    })
    .filter(
      (
        item,
      ): item is {
        id: string;
        categoryId: string;
        title: string;
        lastActivityMs: number;
        createdAtMs: number | null;
        replyCount: number;
      } => item !== null,
    )
    .sort(
      (a, b) =>
        b.lastActivityMs - a.lastActivityMs ||
        (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      title: item.title,
      replyCount: item.replyCount,
      lastActivityAt: new Date(item.lastActivityMs).toISOString(),
    }));
}
