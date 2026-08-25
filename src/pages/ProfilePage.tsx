// ===== Profile Page =====

import { Shield, Copy, Check, Key, Tag } from 'lucide-react';
import { useState } from 'react';
import { useAppSelector } from '../store';
import UserRoleBadge from '../components/common/UserRoleBadge';

const ProfilePage = () => {
  const { address, name, names, role, balance, isAuthenticated, isLoading } =
    useAppSelector((state) => state.auth);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
          <div className="mb-4 h-16 w-16 rounded-full bg-[var(--color-surface-muted)]" />
          <div className="mb-3 h-6 w-40 rounded bg-[var(--color-surface-muted)]" />
          <div className="h-4 w-60 rounded bg-[var(--color-surface-muted)]" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-xl bg-[var(--color-surface-card)] p-8 text-center shadow-sm">
        <Shield className="mx-auto mb-3 h-12 w-12 text-[var(--color-text-muted)]" />
        <h1 className="mb-2 text-xl font-bold text-[var(--color-text-primary)]">
          Not Signed In
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Open this app inside Qortium Home to sign in with your wallet.
        </p>
      </div>
    );
  }

  const initials = name
    ? name
        .split(' ')
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('')
        .slice(0, 2)
    : 'Q';

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-[var(--color-accent)] text-xl font-bold text-white shadow-md">
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                {name || 'Unnamed User'}
              </h1>
              <UserRoleBadge role={role} />
            </div>

            {/* Address */}
            <div className="mb-3 flex items-center gap-2">
              <code className="rounded bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
                {address
                  ? `${address.slice(0, 8)}...${address.slice(-6)}`
                  : 'No address'}
              </code>
              <button
                onClick={() => address && handleCopy(address)}
                className="rounded-md p-1 text-[var(--color-text-muted)] transition hover:bg-slate-800 hover:text-[var(--color-text-primary)]"
                title="Copy address"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-4">
              {balance !== null && (
                <div className="flex items-center gap-1.5 rounded-lg bg-emerald-950/50 px-3 py-1.5">
                  <span className="text-xs text-[var(--color-text-muted)]">
                    Balance
                  </span>
                  <span className="text-sm font-bold tabular-nums text-emerald-400">
                    {balance.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}{' '}
                    QORT
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Names */}
      {names.length > 0 && (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            <Tag className="h-4 w-4 text-cyan-500" />
            Registered Names
          </h2>
          <div className="flex flex-wrap gap-2">
            {names.map((n) => (
              <span
                key={n}
                className="rounded-full border border-cyan-800 bg-cyan-950/50 px-3 py-1 text-xs font-medium text-cyan-400"
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Wallet info */}
      <div className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <Key className="h-4 w-4 text-cyan-500" />
          Wallet Information
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Address</span>
            <code className="text-xs text-[var(--color-text-secondary)]">
              {address || 'N/A'}
            </code>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Role</span>
            <UserRoleBadge role={role} />
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Bridge</span>
            <span className="text-xs text-emerald-400">
              {address ? 'Connected' : 'Dev Mode'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
