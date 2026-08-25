// ===== QDN Resource Status Component =====

import { CheckCircle2, Loader2, CloudOff } from 'lucide-react';
import { isQortiumBridgeAvailable } from '../../services/qortium/qortiumClient';

type QdnStatus = 'ready' | 'syncing' | 'offline';

interface QdnStatusBadgeProps {
  status?: QdnStatus;
  className?: string;
}

const statusConfig: Record<QdnStatus, { icon: typeof CheckCircle2; label: string; cls: string }> = {
  ready: {
    icon: CheckCircle2,
    label: 'QDN Ready',
    cls: 'border-emerald-800 bg-emerald-950 text-emerald-300',
  },
  syncing: {
    icon: Loader2,
    label: 'QDN Syncing',
    cls: 'border-amber-800 bg-amber-950 text-amber-300',
  },
  offline: {
    icon: CloudOff,
    label: 'QDN Offline',
    cls: 'border-slate-700 bg-[var(--color-surface-muted)] text-slate-400',
  },
};

const QdnStatusBadge = ({ className = '' }: QdnStatusBadgeProps) => {
  const bridgeAvailable = isQortiumBridgeAvailable();
  const status: QdnStatus = bridgeAvailable ? 'ready' : 'offline';
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${config.cls} ${className}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
};

export default QdnStatusBadge;
