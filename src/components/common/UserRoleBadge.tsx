// ===== User Role Badge Component =====

import type { UserRole } from '../../types';

interface UserRoleBadgeProps {
  role: UserRole;
  className?: string;
}

const roleStyles: Record<UserRole, string> = {
  SysOp: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  SuperAdmin:
    'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-600 dark:bg-rose-900/30 dark:text-rose-300',
  Admin:
    'border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300',
  Moderator:
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  Creator:
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
  Member:
    'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-900/30 dark:text-slate-400',
};

const roleLabels: Record<UserRole, string> = {
  SysOp: 'SysOp',
  SuperAdmin: 'Super Admin',
  Admin: 'Admin',
  Moderator: 'Moderator',
  Creator: 'Creator',
  Member: 'Member',
};

const UserRoleBadge = ({ role, className = '' }: UserRoleBadgeProps) => (
  <span
    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-tight ${roleStyles[role]} ${className}`}
  >
    {roleLabels[role]}
  </span>
);

export default UserRoleBadge;
