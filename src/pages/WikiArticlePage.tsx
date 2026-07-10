// ===== Wiki Article Detail Page =====

import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Edit3, BookOpen } from 'lucide-react';
import { useGetArticleQuery, useGetCategoriesQuery, useGetArticlesQuery } from '../store/api/wikiApi';
import { useAppSelector } from '../store';
import { parseMarkdown } from '../services/forum/markdown';

const EDITOR_ROLES = new Set(['SysOp', 'SuperAdmin', 'Admin', 'Creator']);

const WikiArticlePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading } = useGetArticleQuery(slug || '');
  const { data: categories } = useGetCategoriesQuery();
  const { data: allArticles } = useGetArticlesQuery();
  const { role } = useAppSelector((s) => s.auth);
  const canEdit = EDITOR_ROLES.has(role);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse rounded-xl bg-[var(--color-surface-card)] p-6">
          <div className="mb-3 h-6 w-1/2 rounded bg-slate-200" />
          <div className="space-y-2"><div className="h-4 w-full rounded bg-slate-100" /><div className="h-4 w-3/4 rounded bg-slate-100" /></div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
        <p className="text-red-700 dark:text-red-400">Article not found.</p>
        <Link to="/wiki" className="mt-2 inline-block text-sm text-cyan-600">Back to Wiki</Link>
      </div>
    );
  }

  const cat = categories?.find((c) => c.id === article.categoryId);
  const catArticles = (allArticles ?? []).filter((a) => a.categoryId === article.categoryId);

  return (
    <div className="flex gap-8">
      {/* Sidebar nav */}
      <aside className="hidden w-52 shrink-0 lg:block">
        <div className="sticky top-6 space-y-4">
          <Link to="/wiki" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]">
            <ArrowLeft className="h-4 w-4" /> Back to Wiki
          </Link>

          {cat && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                <BookOpen className="h-3 w-3" /> {cat.icon} {cat.name}
              </h3>
              <nav className="space-y-0.5">
                {catArticles.map((a) => (
                  <Link
                    key={a.id}
                    to={`/wiki/${a.slug}`}
                    className={`block rounded-md px-2.5 py-1.5 text-sm transition ${
                      a.slug === slug
                        ? 'bg-cyan-50 font-medium text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400'
                        : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {a.title}
                  </Link>
                ))}
              </nav>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center gap-2 lg:hidden">
          <Link to="/wiki" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <ArrowLeft className="h-4 w-4 inline" /> Wiki
          </Link>
          {cat && <span className="text-xs text-[var(--color-text-muted)]">/ {cat.name}</span>}
        </div>

        <article className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
          <h1 className="mb-3 text-2xl font-bold text-[var(--color-text-primary)]">
            {article.title}
          </h1>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text-secondary)]">{article.authorName}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Updated {new Date(article.updatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            {canEdit && (
              <Link to={`/wiki/${article.slug}/edit`} className="ml-auto flex items-center gap-1 rounded-lg border border-[var(--color-border-subtle)] px-2.5 py-1 text-cyan-600 transition hover:border-cyan-300 dark:text-cyan-400">
                <Edit3 className="h-3 w-3" /> Edit
              </Link>
            )}
          </div>
          <div className="prose prose-slate max-w-none dark:prose-invert">
            {parseMarkdown(article.content)}
          </div>
        </article>
      </div>
    </div>
  );
};

export default WikiArticlePage;
