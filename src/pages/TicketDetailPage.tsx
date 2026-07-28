// ===== Ticket Detail Page =====

import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bug, Lightbulb, HelpCircle, MessageSquare, Clock, Send } from 'lucide-react';
import { useGetTicketQuery, useAddResponseMutation } from '../store/api/supportApi';
import { useAppSelector } from '../store';
import { parseMarkdown } from '../services/forum/markdown';
import type { TicketType } from '../types/support';

const typeIcons: Record<TicketType, typeof Bug> = { bug: Bug, feature: Lightbulb, question: HelpCircle, general: MessageSquare };
const typeColors: Record<TicketType, string> = { bug: 'text-rose-600', feature: 'text-amber-600', question: 'text-blue-600', general: 'text-slate-600' };

const TicketDetailPage = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { data: result, isLoading, error } = useGetTicketQuery(ticketId || '');
  const [addResponse, { isLoading: isSending }] = useAddResponseMutation();
  const { name, address } = useAppSelector((s) => s.auth);
  const [replyContent, setReplyContent] = useState('');
  const ticket = result?.ticket;

  const handleReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !ticket) return;
    try { await addResponse({ ticketId: ticket.id, content: replyContent.trim(), authorName: name || 'Anonymous', authorAddress: address || '' }).unwrap(); setReplyContent(''); }
    catch { /* RTK Query handles */ }
  };

  if (isLoading) return (<div className="space-y-4"><div className="animate-pulse rounded-xl bg-[var(--color-surface-card)] p-6"><div className="mb-3 h-6 w-2/3 rounded bg-slate-200" /><div className="h-4 w-full rounded bg-slate-100" /></div></div>);

  // Distinguish: incomplete discovery vs definitive not-found vs unavailable
  if (!ticket) {
    const errMsg: string | undefined =
      error && typeof error === 'object' && 'error' in error ? String((error as Record<string, unknown>).error)
      : error && typeof error === 'object' && 'message' in error ? String((error as Record<string, unknown>).message)
      : undefined;
    const isIncomplete = errMsg?.includes('incomplete');
    const isUnavailable = errMsg?.includes('unavailable');

    if (isUnavailable) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
          <p className="text-red-700 dark:text-red-400">Support is currently unavailable. Please try again later.</p>
          <Link to="/support" className="mt-2 inline-block text-sm text-cyan-600">Back to Support</Link>
        </div>
      );
    }

    if (isIncomplete) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950">
          <p className="text-amber-700 dark:text-amber-400">Ticket could not be found in incomplete results. Discovery may still be in progress.</p>
          <Link to="/support" className="mt-2 inline-block text-sm text-cyan-600">Back to Support</Link>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
        <p className="text-red-700 dark:text-red-400">Ticket not found.</p>
        <Link to="/support" className="mt-2 inline-block text-sm text-cyan-600">Back to Support</Link>
      </div>
    );
  }

  const Icon = typeIcons[ticket.type];
  const replyCount = ticket.responses?.length ?? 0;

  return (
    <div className="space-y-6">
      <Link to="/support" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]"><ArrowLeft className="h-4 w-4" /> Back to Support</Link>

      {result?.completeness === 'incomplete' && (<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">Some support resources could not be loaded. The visible ticket or replies may be incomplete.</div>)}

      <div className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${typeColors[ticket.type]} border-current/20 bg-current/5`}><Icon className="h-3 w-3" />{ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1)}</span>
          {ticket.categoryName && (<span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">{ticket.categoryName}</span>)}
        </div>
        <h1 className="mb-3 text-xl font-bold text-[var(--color-text-primary)]">{ticket.title}</h1>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]"><span className="font-medium text-[var(--color-text-secondary)]">{ticket.authorName}</span><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(ticket.createdAt).toLocaleDateString('en-US',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>
        <div className="prose prose-sm max-w-none">{parseMarkdown(ticket.description)}</div>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">Responses ({replyCount})</h2>
        {replyCount === 0 ? (<p className="mb-4 text-sm text-[var(--color-text-muted)]">No responses yet.</p>) : (
          <div className="mb-4 space-y-3">{ticket.responses.map(r => (<div key={r.id} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-4"><div className="mb-2 flex items-center gap-2"><div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[10px] font-bold text-white">{r.authorName.slice(0,2).toUpperCase()}</div><span className="text-xs font-medium text-[var(--color-text-primary)]">{r.authorName}</span><span className="text-[10px] text-[var(--color-text-muted)]">{new Date(r.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div><p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">{r.content}</p></div>))}</div>
        )}

        <form onSubmit={handleReply} className="space-y-2"><div className="relative"><textarea value={replyContent} onChange={e => setReplyContent(e.target.value)} placeholder="Write a response..." disabled={isSending} rows={3} className="w-full resize-none rounded-lg border border-[var(--color-border-subtle)] bg-white p-3 pr-10 text-sm dark:bg-slate-900" /><button type="submit" disabled={!replyContent.trim() || isSending} className="absolute bottom-3 right-3 rounded p-1.5 text-cyan-500 transition hover:bg-cyan-50 disabled:opacity-30 dark:hover:bg-cyan-950"><Send className="h-4 w-4" /></button></div></form>
      </section>
    </div>
  );
};

export default TicketDetailPage;
