// ===== Ticket Detail Page =====

import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bug, Lightbulb, HelpCircle, MessageSquare, Clock, Send, Lock } from 'lucide-react';
import { useGetTicketQuery, useAddResponseMutation, useCloseTicketMutation } from '../store/api/supportApi';
import { useAppSelector } from '../store';
import { RichTextContent } from '../components/editor/RichTextContent';
import { RichTextEditor } from '../components/editor/RichTextEditor';
import TicketStatusBadge from '../components/support/TicketStatusBadge';
import type { TicketType } from '../types/support';

const typeIcons: Record<TicketType, typeof Bug> = { bug: Bug, feature: Lightbulb, question: HelpCircle, general: MessageSquare };
const typeColors: Record<TicketType, string> = { bug: 'text-rose-400', feature: 'text-amber-400', question: 'text-blue-400', general: 'text-slate-400' };

const formatTicketDate = (value: string) => {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Unknown'
    : parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const TicketDetailPage = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { data: result, isLoading, error } = useGetTicketQuery(ticketId || '');
  const [addResponse, { isLoading: isSending }] = useAddResponseMutation();
  const [closeTicket, { isLoading: isClosing }] = useCloseTicketMutation();
  const { name, address, role } = useAppSelector((s) => s.auth);
  const [replyContent, setReplyContent] = useState('');
  const [actionError, setActionError] = useState('');
  const ticket = result?.ticket;
  const closeDegraded = ticket?.closeBoundaryDegraded === true;

  const handleReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !ticket) return;
    try { await addResponse({ ticketId: ticket.id, content: replyContent.trim(), authorName: name || 'Anonymous', authorAddress: address || '' }).unwrap(); setReplyContent(''); }
    catch { /* RTK Query handles */ }
  };

  const canClose = Boolean(
    ticket &&
    ticket.status === 'Open' &&
    !closeDegraded &&
    address &&
    (address === ticket.authorAddress || role === 'SysOp' || role === 'Admin'),
  );

  const handleClose = async () => {
    if (!ticket || !canClose || isClosing) return;
    setActionError('');
    const confirmed = window.confirm('Close this ticket? A closed ticket stays permanently closed and cannot accept new replies.');
    if (!confirmed) return;
    try {
      await closeTicket({ ticketId: ticket.id }).unwrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to close ticket.');
    }
  };

  if (isLoading) return (<div className="space-y-4"><div className="animate-pulse rounded-xl bg-[var(--color-surface-card)] p-6"><div className="mb-3 h-6 w-2/3 rounded bg-[var(--color-surface-muted)]" /><div className="h-4 w-full rounded bg-[var(--color-surface-muted)]" /></div></div>);

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
        <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
          <p className="text-red-400">Support is currently unavailable. Please try again later.</p>
          <Link to="/support" className="mt-2 inline-block text-sm text-cyan-600">Back to Support</Link>
        </div>
      );
    }

    if (isIncomplete) {
      return (
        <div className="rounded-xl border border-amber-800 bg-amber-950 p-6 text-center">
          <p className="text-amber-400">Ticket could not be found in incomplete results. Discovery may still be in progress.</p>
          <Link to="/support" className="mt-2 inline-block text-sm text-cyan-600">Back to Support</Link>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
        <p className="text-red-400">Ticket not found.</p>
        <Link to="/support" className="mt-2 inline-block text-sm text-cyan-600">Back to Support</Link>
      </div>
    );
  }

  const Icon = typeIcons[ticket.type];
  const replyCount = ticket.responses?.length ?? 0;
  const isClosed = ticket.status === 'Closed';

  return (
    <div className="space-y-6">
      <Link to="/support" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]"><ArrowLeft className="h-4 w-4" /> Back to Support</Link>

      {result?.completeness === 'incomplete' && (<div className="rounded-lg border border-amber-800 bg-amber-950 p-3 text-sm text-amber-400">Some support resources could not be loaded. The visible ticket or replies may be incomplete.</div>)}
      {closeDegraded && (<div className="rounded-lg border border-amber-800 bg-amber-950 p-3 text-sm text-amber-400">This ticket may have been closed by an administrator, but role history is currently unavailable or incomplete. Replies are quarantined until the close state can be verified.</div>)}

      <div className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${typeColors[ticket.type]} border-current/20 bg-current/5`}><Icon className="h-3 w-3" />{ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1)}</span>
          {ticket.categoryName && (<span className="rounded-full bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-[11px] font-medium text-slate-400">{ticket.categoryName}</span>)}
          <TicketStatusBadge status={ticket.status} closedAt={ticket.closedAt} degraded={closeDegraded} />
        </div>
        <h1 className="mb-3 text-xl font-bold text-[var(--color-text-primary)]">{ticket.title}</h1>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]"><span className="font-medium text-[var(--color-text-secondary)]">{ticket.authorName}</span><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTicketDate(ticket.createdAt)}</span></div>
        <RichTextContent value={ticket.description} />

        {canClose && (
          <div className="mt-4 border-t border-[var(--color-border-subtle)] pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isClosing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {isClosing ? 'Closing...' : 'Close Ticket'}
            </button>
          </div>
        )}

        {actionError && (
          <div className="mt-3 rounded border border-red-800 bg-red-950 p-2 text-xs text-red-400">
            {actionError}
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">Responses ({replyCount})</h2>
        {replyCount === 0 ? (<p className="mb-4 text-sm text-[var(--color-text-muted)]">No responses yet.</p>) : (
          <div className="mb-4 space-y-3">{ticket.responses.map(r => (<div key={r.id} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-4"><div className="mb-2 flex items-center gap-2"><div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-[var(--color-accent)] text-[10px] font-bold text-white">{r.authorName.slice(0,2).toUpperCase()}</div><span className="text-xs font-medium text-[var(--color-text-primary)]">{r.authorName}</span><span className="text-[10px] text-[var(--color-text-muted)]">{formatTicketDate(r.createdAt)}</span></div><RichTextContent value={r.content} /></div>))}</div>
        )}

        {isClosed ? (
          <div className="rounded-lg border border-slate-700 bg-[var(--color-surface-card)] p-4 text-sm text-[var(--color-text-muted)]">
            This ticket is closed and no longer accepts replies.
          </div>
        ) : closeDegraded ? (
          <div className="rounded-lg border border-amber-800 bg-amber-950 p-4 text-sm text-amber-400">
            Replies are temporarily quarantined because the ticket&apos;s close state cannot be verified.
          </div>
        ) : (
          <form onSubmit={handleReply} className="space-y-2">
            <RichTextEditor value={replyContent} onChange={setReplyContent} ownerName={name || ''} placeholder="Write a response..." disabled={isSending} minRows={3} />
            <button type="submit" disabled={!replyContent.trim() || isSending} className="rounded p-1.5 text-cyan-500 transition hover:bg-cyan-950 disabled:opacity-30"><Send className="h-4 w-4" /></button>
          </form>
        )}
      </section>
    </div>
  );
};

export default TicketDetailPage;
