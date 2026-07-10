// ===== Support Page – Ticket List + Create =====

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bug,
  Lightbulb,
  HelpCircle,
  MessageSquare,
  Plus,
  Clock,
  MessageCircle,
  ChevronRight,
} from 'lucide-react';
import { useGetTicketsQuery } from '../store/api/supportApi';
import NewTicketForm from '../components/support/NewTicketForm';
import type { TicketType, TicketStatus } from '../types/support';

const typeIcons: Record<TicketType, typeof Bug> = {
  bug: Bug,
  feature: Lightbulb,
  question: HelpCircle,
  general: MessageSquare,
};

const typeColors: Record<TicketType, string> = {
  bug: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400',
  feature: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400',
  question: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400',
  general: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
};

const statusColors: Record<TicketStatus, string> = {
  open: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  'in-progress': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400',
  resolved: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  closed: 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800',
};

const SupportPage = () => {
  const { data: tickets, isLoading } = useGetTicketsQuery();
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<TicketStatus | 'all'>('all');

  const filtered = (tickets ?? []).filter((t) =>
    filter === 'all' ? true : t.status === filter
  );

  const counts = {
    all: tickets?.length ?? 0,
    open: tickets?.filter((t) => t.status === 'open').length ?? 0,
    'in-progress': tickets?.filter((t) => t.status === 'in-progress').length ?? 0,
    resolved: tickets?.filter((t) => t.status === 'resolved').length ?? 0,
    closed: tickets?.filter((t) => t.status === 'closed').length ?? 0,
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg bg-[var(--color-surface-card)] p-4">
            <div className="h-4 w-2/3 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
            Support Center
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Report bugs, suggest features, or ask questions
          </p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-700"
        >
          <Plus className="h-4 w-4" /> New Ticket
        </button>
      </div>

      {showNew && (
        <NewTicketForm
          onCancel={() => setShowNew(false)}
          onSuccess={() => setShowNew(false)}
        />
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'open', 'in-progress', 'resolved', 'closed'] as const).map(
          (s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === s
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-100 text-[var(--color-text-muted)] hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
              }`}
            >
              {s === 'all' ? 'All' : s.replace('-', ' ')}
              <span className="ml-1 opacity-60">({counts[s]})</span>
            </button>
          )
        )}
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-8 text-center">
          <HelpCircle className="mx-auto mb-2 h-10 w-10 text-slate-300" />
          <p className="text-sm text-[var(--color-text-muted)]">
            No tickets found.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ticket) => {
            const Icon = typeIcons[ticket.type];
            return (
              <Link
                key={ticket.id}
                to={`/support/${ticket.id}`}
                className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm transition hover:shadow-md"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${typeColors[ticket.type]}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                    {ticket.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <span>{ticket.authorName}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(ticket.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    {ticket.responses.length > 0 && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {ticket.responses.length}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[ticket.status]}`}
                >
                  {ticket.status === 'in-progress'
                    ? 'In Progress'
                    : ticket.status.charAt(0).toUpperCase() +
                      ticket.status.slice(1)}
                </span>
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-[var(--color-text-muted)] sm:block" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SupportPage;
