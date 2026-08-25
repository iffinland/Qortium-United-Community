// ===== Event Temporal Status Derivation =====
//
// Derives the Upcoming / Ongoing / Past presentation state from the
// authoritative event time. This is never stored on the canonical Event
// resource; it is computed from startDate/endDate whenever the event is read.

export type EventTemporalStatus = 'upcoming' | 'ongoing' | 'past';

/**
 * Derive the temporal status for an event.
 *
 * Semantics:
 *   now < startDate                        -> upcoming
 *   startDate <= now <= effectiveEnd       -> ongoing
 *   now > effectiveEnd                     -> past
 *
 * Effective end:
 *   - endDate when present.
 *   - startDate when endDate is omitted (a point-in-time event). Such an
 *     event is therefore Upcoming before it starts and Past once it starts;
 *     it never appears as Ongoing.
 *
 * Invalid startDate fails closed to "upcoming" so malformed data is never
 * mislabelled as Past.
 */
export function deriveEventTemporalStatus(
  startDate: number,
  endDate: number | null | undefined,
  now: number = Date.now(),
): EventTemporalStatus {
  if (!Number.isFinite(startDate)) return 'upcoming';

  const nowMs = Number.isFinite(now) ? now : Date.now();
  if (nowMs < startDate) return 'upcoming';

  if (typeof endDate !== 'number' || !Number.isFinite(endDate)) return 'past';

  return nowMs <= endDate ? 'ongoing' : 'past';
}

// ---- Grouping ----

export interface EventTiming {
  entityId: string;
  startDateMs: number;
  endDateMs: number | null;
}

/**
 * Group events into Upcoming / Ongoing / Past using derived temporal status.
 *
 * Ordering is deterministic:
 *   Upcoming / Ongoing — soonest start first.
 *   Past — most recently started first.
 */
export function groupEventsByTemporalStatus<T extends EventTiming>(
  events: readonly T[],
  now: number = Date.now(),
): { upcoming: T[]; ongoing: T[]; past: T[] } {
  const upcoming: T[] = [];
  const ongoing: T[] = [];
  const past: T[] = [];

  for (const event of events) {
    const status = deriveEventTemporalStatus(
      event.startDateMs,
      event.endDateMs,
      now,
    );
    if (status === 'upcoming') upcoming.push(event);
    else if (status === 'ongoing') ongoing.push(event);
    else past.push(event);
  }

  const ascending = (a: T, b: T) =>
    a.startDateMs - b.startDateMs || a.entityId.localeCompare(b.entityId);

  upcoming.sort(ascending);
  ongoing.sort(ascending);
  past.sort(
    (a, b) => b.startDateMs - a.startDateMs || a.entityId.localeCompare(b.entityId),
  );

  return { upcoming, ongoing, past };
}
