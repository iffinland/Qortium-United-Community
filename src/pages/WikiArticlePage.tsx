// ===== Wiki Article Detail Page =====

import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, BookOpen, Archive, WifiOff } from 'lucide-react';
import { useGetWikiArticleQuery, useGetCategoriesQuery, useGetWikiListQuery } from '../store/api/wikiApi';
import { RichTextContent } from '../components/editor/RichTextContent';

const WikiArticlePage = () => {
  const { entityId } = useParams<{ entityId: string }>();
  const { data: detail, isLoading } = useGetWikiArticleQuery(entityId || '');
  const { data: categories } = useGetCategoriesQuery();
  const { data: wikiList } = useGetWikiListQuery();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse rounded-xl bg-[var(--color-surface-card)] p-6">
          <div className="mb-3 h-6 w-1/2 rounded bg-[var(--color-surface-muted)]" />
          <div className="space-y-2"><div className="h-4 w-full rounded bg-[var(--color-surface-muted)]" /><div className="h-4 w-3/4 rounded bg-[var(--color-surface-muted)]" /></div>
        </div>
      </div>
    );
  }

  if (!detail || detail.status === 'unavailable') {
    return (
      <div className="rounded-xl border border-amber-800 bg-amber-950 p-6 text-center">
        <WifiOff className="mx-auto mb-2 h-6 w-6 text-amber-400" />
        <p className="text-amber-400">Article data is currently unavailable.</p>
        <Link to="/wiki" className="mt-2 inline-block text-sm text-cyan-600">Back to Wiki</Link>
      </div>
    );
  }

  if (detail.status === 'not-found') {
    return (
      <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
        <p className="text-red-400">Article not found.</p>
        <Link to="/wiki" className="mt-2 inline-block text-sm text-cyan-600">Back to Wiki</Link>
      </div>
    );
  }

  if (detail.status === 'malformed') {
    return (
      <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
        <p className="text-red-400">Article data is malformed and cannot be displayed.</p>
        <Link to="/wiki" className="mt-2 inline-block text-sm text-cyan-600">Back to Wiki</Link>
      </div>
    );
  }

  const article = detail.article!;
  const cat = categories?.find((c) => c.id === article.categoryId);
  const allArticles = wikiList?.status !== 'unavailable' ? (wikiList?.articles ?? []) : [];
  const catArticles = allArticles.filter((a) => a.categoryId === article.categoryId);

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
                    key={a.entityId}
                    to={`/wiki/article/${a.entityId}`}
                    className={`block rounded-md px-2.5 py-1.5 text-sm transition ${
                      a.entityId === entityId
                        ? 'bg-cyan-950 font-medium text-cyan-400'
                        : 'text-[var(--color-text-muted)] hover:bg-slate-800'
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

        {detail.status === 'archived' && (
          <div className="rounded-lg border border-amber-800 bg-amber-950 px-4 py-2 text-sm text-amber-400">
            <Archive className="mr-1.5 inline h-4 w-4" />
            This article has been archived and is no longer maintained.
          </div>
        )}

        <article className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
          <h1 className="mb-3 text-2xl font-bold text-[var(--color-text-primary)]">
            {article.title}
          </h1>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text-secondary)]">{article.publisherName}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />
              {article.updatedAt
                ? `Updated ${new Date(article.updatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                : 'Update date unavailable'}
            </span>
            <span className="text-[var(--color-text-muted)]">v{article.revision}</span>
          </div>
          <RichTextContent value={article.content} />
        </article>
      </div>
    </div>
  );
};

export default WikiArticlePage;
