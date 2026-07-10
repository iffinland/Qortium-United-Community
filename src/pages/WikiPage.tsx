// ===== Wiki Home Page =====

import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight, Clock, Plus } from 'lucide-react';
import { useGetCategoriesQuery, useGetArticlesQuery } from '../store/api/wikiApi';
import { useAppSelector } from '../store';

const EDITOR_ROLES = new Set(['SysOp', 'SuperAdmin', 'Admin', 'Creator']);

const WikiPage = () => {
  const { data: categories } = useGetCategoriesQuery();
  const { data: articles, isLoading } = useGetArticlesQuery();
  const { role } = useAppSelector((s) => s.auth);
  const canCreate = EDITOR_ROLES.has(role);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl bg-[var(--color-surface-card)] p-5">
            <div className="mb-2 h-5 w-40 rounded bg-slate-200" />
            <div className="h-3 w-60 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-text-primary)]">
            <BookOpen className="h-6 w-6 text-cyan-500" />
            Wiki
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Community knowledge base — learn, contribute, share
          </p>
        </div>
        {canCreate && (
          <Link
            to="/wiki/new"
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-700"
          >
            <Plus className="h-4 w-4" />
            Create Article
          </Link>
        )}
      </div>

      <p className="text-sm italic text-[var(--color-text-muted)]">
        Start here for guides, documentation, and FAQs. If you cannot find what you need, ask in the{' '}
        <Link to="/forum" className="text-cyan-600 underline">Forum</Link> or open a{' '}
        <Link to="/support" className="text-cyan-600 underline">Support ticket</Link>.
      </p>

      {(categories ?? []).map((cat) => {
        const catArticles = (articles ?? []).filter((a) => a.categoryId === cat.id);
        return (
          <div key={cat.id} className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
              <span>{cat.icon}</span> {cat.name}
            </h2>
            <p className="mb-3 text-xs text-[var(--color-text-muted)]">{cat.description}</p>
            <div className="space-y-1">
              {catArticles.map((article) => (
                <Link
                  key={article.id}
                  to={`/wiki/${article.slug}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="text-[var(--color-text-primary)]">{article.title}</span>
                  <span className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <Clock className="h-3 w-3" />
                    {new Date(article.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    <ArrowRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default WikiPage;
