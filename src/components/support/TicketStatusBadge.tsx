// ===== Support Ticket Status Badge =====

import { CheckCircle2, Lock, AlertTriangle } from 'lucide-react';
import type { TicketStatus } from '../../types/support';

interface TicketStatusBadgeProps {
  status: TicketStatus;
  closedAt?: string;
  /** True when the authoritative close state cannot currently be proven. */
  degraded?: boolean;
}

const TicketStatusBadge = ({ status, closedAt, degraded }: TicketStatusBadgeProps) => {
  if (degraded) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-800 bg-amber-950 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
        <AlertTriangle className="h-3 w-3" />
        Status: Unavailable
      </span>
    );
  }

  if (status === 'Closed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[11px] font-medium text-slate-400">
        <Lock className="h-3 w-3" />
        Status: Closed
        {closedAt ? ` · ${new Date(closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
      <CheckCircle2 className="h-3 w-3" />
      Status: Open
    </span>
  );
};

export default TicketStatusBadge;
