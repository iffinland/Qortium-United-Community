// ===== Events Page – Canonical QDN Architecture =====
//
// Read-only public event discovery grouped into Upcoming / Ongoing / Past.
// Event creation is an Admin-panel operation, so this page exposes no controls.

import { Calendar, MapPin, Clock, ExternalLink, AlertTriangle, Tag } from 'lucide-react';
import { useGetEventsQuery, type EventView } from '../store/api/eventApi';
import { useAppSelector } from '../store';
import {
  groupEventsByTemporalStatus,
  type EventTemporalStatus,
} from '../services/events/eventStatus';
import { openQdnUrl } from '../services/qortium/qdnNavigation';
import { RichTextContent } from '../components/editor/RichTextContent';

const TEMPORAL_CONFIG: Record<EventTemporalStatus, { label: string; className: string }> = {
  upcoming: { label: 'Upcoming', className: 'border-emerald-800 bg-emerald-950 text-emerald-400' },
  ongoing: { label: 'Ongoing', className: 'border-cyan-800 bg-cyan-950 text-cyan-400' },
  past: { label: 'Past', className: 'border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] text-slate-300' },
};

const formatDateTime = (ms: number): string =>
  new Date(ms).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const EventCard = ({ event, temporalStatus }: { event: EventView; temporalStatus: EventTemporalStatus }) => {
  const temporal = TEMPORAL_CONFIG[temporalStatus];

  const handleOpenQdnUrl = async () => {
    if (!event.qdnUrl) return;
    try {
      await openQdnUrl(event.qdnUrl);
    } catch (err) {
      console.error('Failed to open QDN URL:', err);
      window.alert(err instanceof Error ? err.message : 'Failed to open QDN URL.');
    }
  };

  return (
    <article className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {event.title}
          </h3>
          {event.category && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-400">
              <Tag className="h-3 w-3" />
              {event.category}
            </p>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${temporal.className}`}
        >
          {temporal.label}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {formatDateTime(event.startDateMs)}
          {event.endDateMs && <> — {formatDateTime(event.endDateMs)}</>}
        </span>
        {event.location && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {event.location}
          </span>
        )}
      </div>

      <div className="mb-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        <RichTextContent value={event.description} />
      </div>

      {event.qdnUrl && (
        <button
          type="button"
          onClick={handleOpenQdnUrl}
          className="mb-3 inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs font-medium text-cyan-400 transition hover:bg-slate-800"
        >
          <ExternalLink className="h-3.5 w-3.5" /> QDN Link
        </button>
      )}

      <div className="border-t border-[var(--color-border-subtle)] pt-3 text-xs text-[var(--color-text-muted)]">
        Published by{' '}
        <span className="font-medium text-[var(--color-text-secondary)]">
          {event.ownerName}
        </span>
        {event.editedAt && (
          <>
            {' · '}
            Updated {new Date(event.editedAt).toLocaleDateString('en-US')}
          </>
        )}
      </div>
    </article>
  );
};

const EventsPage = () => {
  const walletAddress = useAppSelector((state) => state.auth.address ?? '');
  const { data, isLoading, error } = useGetEventsQuery(walletAddress);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl bg-[var(--color-surface)] p-5 shadow-sm">
            <div className="mb-3 h-5 w-1/2 rounded bg-[var(--color-surface-muted)]" />
            <div className="h-4 w-full rounded bg-[var(--color-surface-muted)]" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-400" />
        <p className="text-red-400">Failed to load events.</p>
      </div>
    );
  }

  const activeEvents = (data?.events ?? []).filter((event) => event.status === 'active');
  const grouped = groupEventsByTemporalStatus(activeEvents);

  const sections: Array<{
    key: EventTemporalStatus;
    title: string;
    events: EventView[];
    emptyMessage: string;
  }> = [
    { key: 'upcoming', title: 'Upcoming', events: grouped.upcoming, emptyMessage: 'No upcoming events.' },
    { key: 'ongoing', title: 'Ongoing', events: grouped.ongoing, emptyMessage: 'No ongoing events.' },
    { key: 'past', title: 'Past', events: grouped.past, emptyMessage: 'No past events.' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          Community Events
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Upcoming, ongoing, and past community events
        </p>
      </div>

      {data?.status === 'incomplete' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-800 bg-amber-950 px-4 py-2 text-sm text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Some events may not be fully loaded — results are incomplete.</span>
        </div>
      )}

      {activeEvents.length === 0 ? (
        <div className="rounded-xl bg-[var(--color-surface)] p-8 text-center shadow-sm">
          <Calendar className="mx-auto mb-2 h-10 w-10 text-[var(--color-text-muted)]" />
          <p className="text-[var(--color-text-muted)]">No events have been added yet.</p>
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.key} aria-labelledby={`events-${section.key}`}>
            <h2
              id={`events-${section.key}`}
              className="mb-3 text-base font-semibold text-[var(--color-text-primary)]"
            >
              {section.title}
              <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                ({section.events.length})
              </span>
            </h2>
            {section.events.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--color-border-subtle)] p-5 text-center text-sm text-[var(--color-text-muted)]">
                {section.emptyMessage}
              </p>
            ) : (
              <div className="space-y-4">
                {section.events.map((event) => (
                  <EventCard key={event.entityId} event={event} temporalStatus={section.key} />
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
};

export default EventsPage;
