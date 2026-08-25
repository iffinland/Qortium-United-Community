// ===== Admin Section Shell =====
//
// Small shared wrapper that keeps each Admin management section visually and
// behaviourally consistent without introducing a generic framework.

import type { ReactNode } from 'react';

interface AdminSectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function AdminSection({ title, description, action, children }: AdminSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default AdminSection;
