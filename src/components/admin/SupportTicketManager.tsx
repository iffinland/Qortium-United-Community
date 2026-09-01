import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAppSelector } from '../../store';
import {
  useGetTicketsQuery,
  useModerateTicketVisibilityMutation,
} from '../../store/api/supportApi';
import { AdminSection } from './AdminSection';

const SupportTicketManager = () => {
  const { name, address } = useAppSelector((state) => state.auth);
  const { data, isLoading, refetch } = useGetTicketsQuery();
  const [moderate, { isLoading: isPublishing }] = useModerateTicketVisibilityMutation();
  const [message, setMessage] = useState('');

  const applyVisibility = async (entityId: string, action: 'hide' | 'restore') => {
    if (!name || !address) {
      setMessage('A registered Admin or SysOp identity is required.');
      return;
    }
    setMessage('');
    try {
      await moderate({
        entityId,
        action,
        actorName: name,
        actorAddress: address,
        reason: action === 'hide'
          ? 'Unavailable or inappropriate Support ticket hidden by an authorized administrator.'
          : 'Support ticket restored by an authorized administrator.',
      }).unwrap();
      setMessage(action === 'hide' ? 'Ticket hidden.' : 'Ticket restored.');
      await refetch();
    } catch (error) {
      setMessage(typeof error === 'string' ? error : 'Moderation operation failed.');
    }
  };

  const unavailable = data?.unavailableTickets.filter((ticket) => !ticket.hidden) ?? [];
  const hiddenIds = data?.hiddenTicketIds ?? [];

  return (
    <AdminSection
      title="Support Tickets"
      description="Hide unavailable or inappropriate tickets through authorized append-only moderation."
    >
      {message && (
        <p className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-text-secondary)]">
          {message}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tickets…
        </div>
      ) : (
        <div className="space-y-5">
          {unavailable.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-amber-300">Unavailable tickets</h3>
              {unavailable.map((ticket) => (
                <div key={ticket.identifier} className="flex items-center justify-between gap-3 rounded-lg border border-amber-800 bg-amber-950 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-amber-200">{ticket.entityId}</p>
                    <p className="truncate text-xs text-amber-400">
                      {ticket.publisherName ?? 'Unknown publisher'} · {ticket.identifier}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isPublishing}
                    onClick={() => void applyVisibility(ticket.entityId, 'hide')}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                  >
                    <EyeOff className="h-4 w-4" /> Hide
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Visible tickets</h3>
            {(data?.tickets ?? []).map((ticket) => (
              <div key={ticket.id} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-surface-card)] p-3 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{ticket.title}</p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">{ticket.authorName} · {ticket.id}</p>
                </div>
                <button
                  type="button"
                  disabled={isPublishing}
                  onClick={() => void applyVisibility(ticket.id, 'hide')}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)] transition hover:border-amber-600 hover:text-amber-300 disabled:opacity-50"
                >
                  <EyeOff className="h-4 w-4" /> Hide
                </button>
              </div>
            ))}
          </div>

          {hiddenIds.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Hidden tickets</h3>
              {hiddenIds.map((entityId) => (
                <div key={entityId} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-surface-card)] p-3 shadow-sm">
                  <p className="truncate text-sm text-[var(--color-text-secondary)]">{entityId}</p>
                  <button
                    type="button"
                    disabled={isPublishing}
                    onClick={() => void applyVisibility(entityId, 'restore')}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)] transition hover:border-cyan-500 hover:text-cyan-300 disabled:opacity-50"
                  >
                    <Eye className="h-4 w-4" /> Restore
                  </button>
                </div>
              ))}
            </div>
          )}

          {!data?.tickets.length && unavailable.length === 0 && hiddenIds.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">No Support tickets found.</p>
          )}
        </div>
      )}
    </AdminSection>
  );
};

export default SupportTicketManager;
