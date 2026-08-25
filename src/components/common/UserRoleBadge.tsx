// ===== User Role Badge Component =====

import type { UserRole } from '../../types';

interface UserRoleBadgeProps {
  role: UserRole;
  className?: string;
}

const roleStyles: Record<UserRole, string> = {
  SysOp: 'border-fuchsia-600 bg-fuchsia-900/30 text-fuchsia-300',
  Admin:
    'border-cyan-600 bg-cyan-900/30 text-cyan-300',
  User:
    'border-slate-600 bg-[var(--color-surface)]/30 text-slate-400',
};

const roleLabels: Record<UserRole, string> = {
  SysOp: 'SysOp',
  Admin: 'Admin',
  User: 'User',
};

const UserRoleBadge = ({ role, className = '' }: UserRoleBadgeProps) => (
  <span
    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-tight ${roleStyles[role]} ${className}`}
  >
    {roleLabels[role]}
  </span>
);

export default UserRoleBadge;
