// ===== Wiki Home Page =====

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight, Clock, AlertTriangle, WifiOff, ChevronDown } from 'lucide-react';
import { useGetCategoriesQuery, useGetWikiListQuery } from '../store/api/wikiApi';

const WikiPage = () => {
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const { data: categories } = useGetCategoriesQuery();
  const { data: wikiList, isLoading } = useGetWikiListQuery();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl bg-[var(--color-surface-card)] p-5">
            <div className="mb-2 h-5 w-40 rounded bg-[var(--color-surface-muted)]" />
            <div className="h-3 w-60 rounded bg-[var(--color-surface-muted)]" />
          </div>
        ))}
      </div>
    );
  }

  const listStatus = wikiList?.status ?? 'unavailable';
  const articles = wikiList?.articles ?? [];
  const diagnostics = wikiList?.diagnostics ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-text-primary)]">
            <BookOpen className="h-6 w-6 text-cyan-500" />
            Wiki
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Community knowledge base
          </p>
        </div>
      </div>

      {listStatus === 'unavailable' && (
        <div className="rounded-xl border border-amber-800 bg-amber-950 p-4 text-center">
          <WifiOff className="mx-auto mb-1 h-5 w-5 text-amber-500" />
          <p className="text-sm text-amber-400">Wiki data is currently unavailable. Please try again later.</p>
        </div>
      )}

      {listStatus === 'incomplete' && (
        <div className="rounded-xl border border-amber-800 bg-amber-950 px-4 py-2 text-sm text-amber-400">
          <AlertTriangle className="mr-1.5 inline h-4 w-4" />
          Wiki data may be incomplete. {diagnostics.length > 0 && diagnostics[0]}
        </div>
      )}

      {listStatus === 'empty' && (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-8 text-center">
          <BookOpen className="mx-auto mb-2 h-8 w-8 text-[var(--color-text-muted)]" />
          <p className="text-[var(--color-text-muted)]">No articles yet.</p>
        </div>
      )}

      <p className="text-sm italic text-[var(--color-text-muted)]">
        Start here for guides, documentation, and FAQs. If you cannot find what you need, ask in the{' '}
        <Link to="/forum" className="text-cyan-600 underline">Forum</Link> or open a{' '}
        <Link to="/support" className="text-cyan-600 underline">Support ticket</Link>.
      </p>

      {(categories ?? []).map((cat) => {
        const catArticles = articles.filter((a) => a.categoryId === cat.id);
        const isOpen = openCategoryId === cat.id;
        const panelId = `wiki-category-${cat.id}`;
        return (
          <section key={cat.id} className="rounded-xl bg-[var(--color-surface-card)] shadow-sm">
            <button
              type="button"
              onClick={() => setOpenCategoryId((current) => (current === cat.id ? null : cat.id))}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center gap-2 rounded-xl p-5 text-left transition hover:bg-slate-800/30"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                  <span>{cat.icon}</span> {cat.name}
                </span>
                <span className="mt-1 block text-xs text-[var(--color-text-muted)]">{cat.description}</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div id={panelId} role="region" className="border-t border-[var(--color-border-subtle)] px-5 pb-5 pt-3">
                {catArticles.length === 0 ? (
                  <p className="text-xs italic text-[var(--color-text-muted)]">No articles in this category yet.</p>
                ) : (
                  <div className="space-y-1">
                    {catArticles.map((article) => (
                      <Link
                        key={article.entityId}
                        to={`/wiki/article/${article.entityId}`}
                        className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-slate-800/50"
                      >
                        <span className="text-[var(--color-text-primary)]">{article.title}</span>
                        <span className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                          <Clock className="h-3 w-3" />
                          {article.updatedAt
                            ? new Date(article.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : '—'}
                          <ArrowRight className="h-3 w-3" />
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default WikiPage;
