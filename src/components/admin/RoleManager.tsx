// ===== Role Manager Component =====
//
// SysOp-only UI for managing community roles.
// Lists addresses per role level and allows adding/removing.
// Follows Discussion-Boards pattern: roles stored in QDN as role-registry.

import { useState } from 'react';
import { ShieldCheck, Plus, Trash2, Save, Users, Crown, UserCog, Gavel, PenTool, type LucideIcon } from 'lucide-react';
import type { RoleRegistry, UserRole } from '../../types';

interface RoleManagerProps {
  registry: RoleRegistry | null;
  onSave: (registry: RoleRegistry) => Promise<void>;
  isSaving: boolean;
}

const ROLE_LEVELS: { role: Exclude<UserRole, 'Member'>; label: string; icon: LucideIcon; color: string }[] = [
  { role: 'SysOp', label: 'SysOp / SuperAdmin', icon: Crown, color: 'text-amber-500' },
  { role: 'Admin', label: 'Admin', icon: UserCog, color: 'text-blue-500' },
  { role: 'Moderator', label: 'Moderator', icon: Gavel, color: 'text-emerald-500' },
  { role: 'Creator', label: 'Creator', icon: PenTool, color: 'text-cyan-500' },
];

const getAddressesForRole = (registry: RoleRegistry | null, role: Exclude<UserRole, 'Member'>): string[] => {
  if (!registry) return [];
  switch (role) {
    case 'SysOp':
      return [registry.primarySysOpAddress, ...registry.sysOps];
    case 'SuperAdmin':
      return registry.sysOps;
    case 'Admin':
      return registry.admins;
    case 'Moderator':
      return registry.moderators;
    case 'Creator':
      return registry.creators;
    default:
      return [];
  }
};

const setAddressesForRole = (registry: RoleRegistry, role: Exclude<UserRole, 'Member'>, addresses: string[]): RoleRegistry => {
  const filtered = addresses
    .map((a) => a.trim())
    .filter((a, i, arr) => a.length > 0 && arr.indexOf(a) === i);
  switch (role) {
    case 'SysOp':
    case 'SuperAdmin':
      return { ...registry, sysOps: filtered };
    case 'Admin':
      return { ...registry, admins: filtered };
    case 'Moderator':
      return { ...registry, moderators: filtered };
    case 'Creator':
      return { ...registry, creators: filtered };
    default:
      return registry;
  }
};

const RoleManager = ({ registry, onSave, isSaving }: RoleManagerProps) => {
  const [editState, setEditState] = useState<Record<string, string[]>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Show loading until registry is available
  if (!registry) {
    return (
      <div className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <div className="flex items-center gap-2 py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-[var(--color-text-muted)]">Loading role registry...</p>
        </div>
      </div>
    );
  }

  // Initialize edit state from registry
  const getAddresses = (role: Exclude<UserRole, 'Member'>): string[] => {
    if (editState[role] !== undefined) return editState[role];
    return getAddressesForRole(registry, role);
  };

  const addAddress = (role: Exclude<UserRole, 'Member'>) => {
    const current = [...getAddresses(role), ''];
    setEditState({ ...editState, [role]: current });
  };

  const updateAddress = (role: Exclude<UserRole, 'Member'>, index: number, value: string) => {
    const current = [...getAddresses(role)];
    current[index] = value;
    setEditState({ ...editState, [role]: current });
  };

  const removeAddress = (role: Exclude<UserRole, 'Member'>, index: number) => {
    const current = getAddresses(role).filter((_, i) => i !== index);
    setEditState({ ...editState, [role]: current });
  };

  const handleSave = async () => {
    if (!registry) return;
    setSaveError(null);

    let updated = { ...registry };
    for (const { role } of ROLE_LEVELS) {
      if (editState[role] !== undefined) {
        updated = setAddressesForRole(updated, role, editState[role]);
      }
    }

    try {
      await onSave(updated);
      setEditState({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(msg);
    }
  };

  const hasChanges = Object.keys(editState).length > 0;

  return (
    <div className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]">
          <ShieldCheck className="h-5 w-5 text-amber-500" />
          Manage Community Roles
        </h2>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {saveError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {saveError}
        </div>
      )}

      <p className="mb-4 text-xs text-[var(--color-text-muted)]">
        Assign addresses to roles. The Primary SysOp address ({registry?.primarySysOpAddress.slice(0, 10)}...) is always SysOp and cannot be changed here.
        SysOp and SuperAdmin share the same list — both have full access, but only SysOp can manage roles.
      </p>

      <div className="space-y-4">
        {ROLE_LEVELS.map(({ role, label, icon: Icon, color }) => {
          const addresses = getAddresses(role);
          return (
            <div key={role} className="rounded-lg border border-[var(--color-border-subtle)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                  <Icon className={`h-4 w-4 ${color}`} />
                  {label}
                  {role === 'SysOp' && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      Primary: {registry?.primarySysOpAddress.slice(0, 8)}...
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => addAddress(role)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] transition hover:bg-slate-100 hover:text-[var(--color-text-primary)] dark:hover:bg-slate-800"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>

              {addresses.length === 0 ? (
                <p className="py-2 text-center text-xs text-[var(--color-text-muted)] italic">
                  No addresses assigned to {label}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {addresses.map((addr, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={addr}
                        onChange={(e) => updateAddress(role, i, e.target.value)}
                        placeholder={`Q... wallet address`}
                        className="flex-1 rounded border border-[var(--color-border-subtle)] bg-white px-2.5 py-1.5 text-xs font-mono dark:bg-slate-900 dark:text-white"
                      />
                      <button
                        onClick={() => removeAddress(role, i)}
                        className="rounded p-1 text-[var(--color-text-muted)] transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
        <p className="text-xs text-[var(--color-text-muted)]">
          <Users className="mr-1 inline h-3 w-3" />
          All other addresses are regular <strong>Members</strong> by default.
        </p>
      </div>
    </div>
  );
};

export default RoleManager;
