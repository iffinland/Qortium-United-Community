// ===== Ticket Detail Page =====

import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Bug, Lightbulb, HelpCircle, MessageSquare,
  Clock, Shield, Send,
} from 'lucide-react';
import {
  useGetTicketQuery,
  useAddResponseMutation,
  useUpdateTicketStatusMutation,
} from '../store/api/supportApi';
import { useAppSelector } from '../store';
import { parseMarkdown } from '../services/forum/markdown';
import type { TicketType, TicketStatus } from '../types/support';

const typeIcons: Record<TicketType, typeof Bug> = {
  bug: Bug, feature: Lightbulb, question: HelpCircle, general: MessageSquare,
};

const typeColors: Record<TicketType, string> = {
  bug: 'text-rose-600', feature: 'text-amber-600', question: 'text-blue-600', general: 'text-slate-600',
};

const statusOptions: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const ADMIN_ROLES = new Set(['SysOp', 'SuperAdmin', 'Admin']);

const TicketDetailPage = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { data: ticket, isLoading } = useGetTicketQuery(ticketId || '');
  const [addResponse, { isLoading: isSending }] = useAddResponseMutation();
  const [updateStatus] = useUpdateTicketStatusMutation();
  const { name, address, role, isAuthenticated } = useAppSelector((s) => s.auth);
  const [replyContent, setReplyContent] = useState('');
  const isAdmin = ADMIN_ROLES.has(role);

  const handleReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !ticket) return;
    try {
      await addResponse({
        ticketId: ticket.id, content: replyContent.trim(),
        authorName: name || 'Anonymous', authorAddress: address || '',
        isOfficial: isAdmin,
      }).unwrap();
      setReplyContent('');
    } catch { /* handled by RTK Query */ }
  };

  const handleStatusChange = async (status: TicketStatus) => {
    if (!ticket) return;
    await updateStatus({ ticketId: ticket.id, status });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse rounded-xl bg-[var(--color-surface-card)] p-6"><div className="mb-3 h-6 w-2/3 rounded bg-slate-200" /><div className="h-4 w-full rounded bg-slate-100" /></div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
        <p className="text-red-700 dark:text-red-400">Ticket not found.</p>
        <Link to="/support" className="mt-2 inline-block text-sm text-cyan-600">Back to Support</Link>
      </div>
    );
  }

  const Icon = typeIcons[ticket.type];

  return (
    <div className="space-y-6">
      <Link to="/support" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]">
        <ArrowLeft className="h-4 w-4" /> Back to Support
      </Link>

      {/* Ticket header */}
      <div className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${typeColors[ticket.type]} border-current/20 bg-current/5`}>
            <Icon className="h-3 w-3" />
            {ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1)}
          </span>
          {/* Admin status control */}
          {isAdmin ? (
            <select
              value={ticket.status}
              onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
              className="rounded-full border border-[var(--color-border-subtle)] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-text-primary)] dark:bg-slate-800"
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {ticket.status === 'in-progress' ? 'In Progress' : ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            ticket.priority === 'high' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400' :
            ticket.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {ticket.priority.toUpperCase()}
          </span>
        </div>

        <h1 className="mb-3 text-xl font-bold text-[var(--color-text-primary)]">{ticket.title}</h1>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span className="font-medium text-[var(--color-text-secondary)]">{ticket.authorName}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(ticket.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        <div className="prose prose-sm max-w-none">{parseMarkdown(ticket.description)}</div>
      </div>

      {/* Responses */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">
          Responses ({ticket.responses.length})
        </h2>

        {ticket.responses.length === 0 ? (
          <p className="mb-4 text-sm text-[var(--color-text-muted)]">No responses yet.</p>
        ) : (
          <div className="mb-4 space-y-3">
            {ticket.responses.map((r) => (
              <div key={r.id} className={`rounded-lg border p-4 ${r.isOfficial ? 'border-cyan-200 bg-cyan-50/30 dark:border-cyan-800 dark:bg-cyan-950/20' : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-card)]'}`}>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[10px] font-bold text-white">
                    {r.authorName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-[var(--color-text-primary)]">{r.authorName}</span>
                  {r.isOfficial && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400">
                      <Shield className="h-2.5 w-2.5" /> Official
                    </span>
                  )}
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">{r.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Reply form */}
        {ticket.status !== 'closed' && (
          <form onSubmit={handleReply} className="space-y-2">
            <div className="relative">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={isAuthenticated ? 'Write a response...' : 'Sign in to respond'}
                disabled={!isAuthenticated || isSending}
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--color-border-subtle)] bg-white p-3 pr-10 text-sm dark:bg-slate-900"
              />
              <button type="submit" disabled={!replyContent.trim() || isSending}
                className="absolute bottom-3 right-3 rounded p-1.5 text-cyan-500 transition hover:bg-cyan-50 disabled:opacity-30 dark:hover:bg-cyan-950">
                <Send className="h-4 w-4" />
              </button>
            </div>
            {isAdmin && (
              <p className="text-xs text-[var(--color-text-muted)]">
                <Shield className="mr-1 inline h-3 w-3 text-cyan-500" />
                Your response will be marked as Official
              </p>
            )}
          </form>
        )}

        {ticket.status === 'closed' && (
          <p className="text-sm italic text-[var(--color-text-muted)]">This ticket is closed. No new responses can be added.</p>
        )}
      </section>
    </div>
  );
};

export default TicketDetailPage;
