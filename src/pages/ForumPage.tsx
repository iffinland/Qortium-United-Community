// ===== Forum Home Page – Categories =====

import { Link } from 'react-router-dom';
import { MessageSquare, ArrowRight } from 'lucide-react';
import { useGetCategoriesQuery } from '../store/api/forumApi';

const ForumPage = () => {
  const { data: categories, isLoading } = useGetCategoriesQuery();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
            <div className="mb-2 h-5 w-40 rounded bg-[var(--color-surface-muted)]" />
            <div className="h-4 w-60 rounded bg-[var(--color-surface-muted)]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Forum</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Discuss ideas, share knowledge, and connect with the community
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(categories ?? []).map((cat) => (
          <Link
            key={cat.id}
            to={`/forum/${cat.id}`}
            className="group rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm transition hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="mb-3 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-muted)] text-xl">
                {cat.icon}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-cyan-600 transition-colors">
                  {cat.name}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)] line-clamp-2">
                  {cat.description}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {cat.threadCount} threads
              </span>
              <span className="flex items-center gap-1 text-cyan-500 opacity-0 transition group-hover:opacity-100">
                Browse <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ForumPage;
