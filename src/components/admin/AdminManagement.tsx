// ===== Admin Management =====
//
// SysOp-only canonical Admin assignment/removal UI.
// Reads the latest accepted qucp-role-snapshot and publishes the next snapshot
// with the requested member change. No obsolete role dropdowns are exposed.

import { useState, type FormEvent } from 'react';
import { ShieldCheck, UserMinus, UserPlus, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  useGetRoleSnapshotQuery,
  useAssignAdminMutation,
  useRemoveAdminMutation,
} from '../../store/api/roleApi';
import { useAppSelector } from '../../store';
import { QUC_SYSOP_ADDRESS } from '../../config/qortiumTrust';

const AdminManagement = () => {
  const { data, isLoading, error } = useGetRoleSnapshotQuery();
  const [assignAdmin, { isLoading: isAssigning }] = useAssignAdminMutation();
  const [removeAdmin, { isLoading: isRemoving }] = useRemoveAdminMutation();
  const address = useAppSelector((s) => s.auth.address) ?? '';

  const [targetAddress, setTargetAddress] = useState('');
  const [targetDisplayName, setTargetDisplayName] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const snapshot = data?.snapshot ?? null;
  const members = snapshot?.members ?? [];
  const admins = members.filter((m) => m.roles.includes('admin'));

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const target = targetAddress.trim();
    if (!target) return;

    try {
      await assignAdmin({
        actorAddress: address,
        targetAddress: target,
        targetDisplayName: targetDisplayName.trim() || undefined,
      }).unwrap();
      setTargetAddress('');
      setTargetDisplayName('');
      showFeedback('success', 'Admin assigned.');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to assign Admin.');
    }
  };

  const handleRemove = async (targetAddress: string) => {
    try {
      await removeAdmin({ actorAddress: address, targetAddress }).unwrap();
      showFeedback('success', 'Admin removed.');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to remove Admin.');
    }
  };

  if (isLoading) {
    return <div className="animate-pulse space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 rounded bg-[var(--color-surface-muted)]" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]">
          <ShieldCheck className="h-5 w-5 text-cyan-500" />
          Admin Management
        </h2>
        <span className="rounded-full border border-cyan-800 bg-cyan-950 px-2 py-0.5 text-xs text-cyan-400">SysOp only</span>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-2 text-xs text-red-400">
          Unable to load role snapshots.
        </div>
      )}
      {data?.completeness === 'incomplete' && (
        <div className="rounded border border-amber-800 bg-amber-950 p-2 text-xs text-amber-300">
          Role snapshots may be incomplete — current Admin assignments may be missing.
        </div>
      )}
      {data?.completeness === 'unavailable' && (
        <div className="rounded border border-red-800 bg-red-950 p-2 text-xs text-red-400">
          Role snapshots are unavailable.
        </div>
      )}

      {feedback && (
        <div className={`flex items-center gap-2 rounded border p-2 text-xs ${feedback.type === 'success' ? 'border-emerald-800 bg-emerald-950 text-emerald-400' : 'border-red-800 bg-red-950 text-red-400'}`}>
          {feedback.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleAdd} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4">
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={targetAddress}
            onChange={(e) => setTargetAddress(e.target.value)}
            placeholder="Wallet address (Q...)"
            className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] px-2.5 py-1.5 text-sm"
          />
          <input
            type="text"
            value={targetDisplayName}
            onChange={(e) => setTargetDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] px-2.5 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={!targetAddress.trim() || isAssigning}
          className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {isAssigning ? 'Publishing...' : 'Add Admin'}
        </button>
      </form>

      <div className="space-y-1">
        <p className="text-xs font-medium text-[var(--color-text-muted)]">Current Admin assignments</p>
        {admins.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No Admins assigned.</p>
        ) : (
          admins.map((m) => (
            <div key={m.address} className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.displayName ?? m.address}</p>
                <p className="truncate text-[0.625rem] text-[var(--color-text-muted)]">{m.address}</p>
              </div>
              <button
                onClick={() => handleRemove(m.address)}
                disabled={isRemoving || m.address === QUC_SYSOP_ADDRESS}
                className="flex shrink-0 items-center gap-1 rounded border border-[var(--color-border-subtle)] p-1.5 text-xs text-[var(--color-text-muted)] transition hover:border-red-700 hover:text-red-400 disabled:opacity-40"
              >
                <UserMinus className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminManagement;
