// ===== Dashboard Recent Activity Normalization =====
//
// Pure normalization for the shared dashboard activity feed. It intentionally
// does not fetch QDN data; callers pass canonical view models and authoritative
// timestamp candidates.

export type DashboardActivityDomain =
  | 'post'
  | 'project'
  | 'poll'
  | 'wiki'
  | 'event';

export interface DashboardActivityCandidate {
  id: string;
  domain: DashboardActivityDomain;
  entityId: string;
  title: string;
  authorName: string;
  /** Authoritative timestamp candidates, newest of which represents activity. */
  timestamps: readonly (string | null | undefined)[];
  path: string;
}

export interface DashboardActivityItem {
  id: string;
  domain: DashboardActivityDomain;
  entityId: string;
  title: string;
  authorName: string;
  occurredAt: string;
  path: string;
}

function toEpochMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Normalize canonical domain items into the dashboard's common activity
 * representation.
 *
 * Items with no valid authoritative timestamp are omitted rather than being
 * assigned a fabricated "now" value.
 */
export function latestDashboardActivity(
  candidates: readonly DashboardActivityCandidate[],
  limit = 5,
): DashboardActivityItem[] {
  const withActivity = candidates
    .map((candidate) => {
      let latestMs: number | null = null;

      for (const timestamp of candidate.timestamps) {
        const parsed = toEpochMs(timestamp);
        if (parsed !== null && (latestMs === null || parsed > latestMs)) {
          latestMs = parsed;
        }
      }

      if (latestMs === null) return null;

      return {
        candidate,
        latestMs,
      };
    })
    .filter(
      (
        item,
      ): item is {
        candidate: DashboardActivityCandidate;
        latestMs: number;
      } => item !== null,
    )
    .sort(
      (a, b) =>
        b.latestMs - a.latestMs || a.candidate.id.localeCompare(b.candidate.id),
    )
    .slice(0, limit);

  return withActivity.map(({ candidate, latestMs }) => ({
    id: candidate.id,
    domain: candidate.domain,
    entityId: candidate.entityId,
    title: candidate.title,
    authorName: candidate.authorName,
    occurredAt: new Date(latestMs).toISOString(),
    path: candidate.path,
  }));
}
