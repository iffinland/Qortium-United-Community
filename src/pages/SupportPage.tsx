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
import type { TicketType } from '../types/support';

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

const SupportPage = () => {
  const { data: result, isLoading } = useGetTicketsQuery();
  const [showNew, setShowNew] = useState(false);
  const [catFilter, setCatFilter] = useState<string | 'all'>('all');

  const tickets = result?.tickets ?? [];
  const categories = result?.categories ?? [];
  const filtered = catFilter === 'all' ? tickets : tickets.filter(t => t.categoryId === catFilter);

  if (isLoading) {
    return (<div className="space-y-2">{[1,2,3].map(i => (<div key={i} className="animate-pulse rounded-lg bg-[var(--color-surface-card)] p-4"><div className="h-4 w-2/3 rounded bg-slate-200" /></div>))}</div>);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-xl font-bold text-[var(--color-text-primary)]">Support Center</h1><p className="text-sm text-[var(--color-text-muted)]">Report bugs, suggest features, or ask questions</p></div>
        <button onClick={() => setShowNew(!showNew)} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-700"><Plus className="h-4 w-4" /> New Ticket</button>
      </div>
      {showNew && <NewTicketForm onCancel={() => setShowNew(false)} onSuccess={() => setShowNew(false)} />}
      {result?.completeness === 'incomplete' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">Some resources could not be loaded. Results may be incomplete.</div>}
      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button key="all" onClick={() => setCatFilter('all')} className={`rounded-full px-3 py-1 text-xs font-medium transition ${catFilter === 'all' ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-[var(--color-text-muted)] hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}`}>All ({tickets.length})</button>
          {categories.filter(c => c.isActive).map(c => (<button key={c.id} onClick={() => setCatFilter(c.id)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${catFilter === c.id ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-[var(--color-text-muted)] hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}`}>{c.name}</button>))}
        </div>
      )}
      {filtered.length === 0 ? (<div className="rounded-xl bg-[var(--color-surface-card)] p-8 text-center"><HelpCircle className="mx-auto mb-2 h-10 w-10 text-slate-300" /><p className="text-sm text-[var(--color-text-muted)]">No tickets found.</p></div>) : (
        <div className="space-y-2">{filtered.map(ticket => { const Icon = typeIcons[ticket.type]; return (<Link key={ticket.id} to={`/support/${ticket.id}`} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm transition hover:shadow-md"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${typeColors[ticket.type]}`}><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{ticket.title}</p><div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-muted)]"><span>{ticket.authorName}</span><span>·</span><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(ticket.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>{ticket.categoryName && <><span>·</span><span>{ticket.categoryName}</span></>}{ticket.responses.length > 0 && <><span>·</span><span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{ticket.responses.length}</span></>}</div></div><ChevronRight className="hidden h-4 w-4 shrink-0 text-[var(--color-text-muted)] sm:block" /></Link>);})}</div>
      )}
    </div>
  );
};

export default SupportPage;
