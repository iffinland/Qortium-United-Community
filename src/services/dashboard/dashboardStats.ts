// ===== Dashboard Community Stats Selectors =====
//
// Small, pure selectors used by the dashboard sidebar. They intentionally
// accept narrow domain inputs so the future Events domain can plug in without
// changing the rest of the dashboard.

export type CounterCompleteness =
  | 'complete'
  | 'incomplete'
  | 'unavailable'
  | 'empty'
  | 'loading';

export interface ProjectCounterInput {
  status: string;
}

export interface PollCounterInput {
  isClosed: boolean;
  expiresAt: string | null;
}

export interface EventCounterInput {
  startDate: string;
}

/**
 * Count projects currently considered active by the canonical Project
 * lifecycle. Archived, planned, and completed projects are intentionally
 * excluded from the dashboard's "Active Projects" counter.
 */
export function countActiveProjects(
  projects: readonly ProjectCounterInput[],
): number {
  return projects.filter((project) => project.status === 'active').length;
}

/**
 * A poll is open when it has not been explicitly closed and either has no
 * expiry timestamp or its expiry timestamp is still in the future.
 */
export function isPollOpen(
  poll: PollCounterInput,
  now: Date = new Date(),
): boolean {
  if (poll.isClosed) return false;
  if (!poll.expiresAt) return true;

  const expiresAtMs = new Date(poll.expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) return false;

  return expiresAtMs > now.getTime();
}

/**
 * Count canonical polls that are open/active according to the existing Poll
 * lifecycle.
 */
export function countActivePolls(
  polls: readonly PollCounterInput[],
  now: Date = new Date(),
): number {
  return polls.filter((poll) => isPollOpen(poll, now)).length;
}

function isSameCalendarMonth(date: Date, now: Date): boolean {
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

/**
 * Count events whose start date falls within the current calendar month.
 *
 * The Qortium United Community app has no canonical Events entity yet, so the
 * dashboard currently passes an empty array and truthfully returns zero. This
 * function is the seam where the later Events-domain task can connect real
 * event data without another dashboard rewrite.
 */
export function countEventsThisMonth(
  events: readonly EventCounterInput[],
  now: Date = new Date(),
): number {
  return events.filter((event) => {
    if (!event.startDate) return false;
    const start = new Date(event.startDate);
    if (Number.isNaN(start.getTime())) return false;
    return isSameCalendarMonth(start, now);
  }).length;
}
