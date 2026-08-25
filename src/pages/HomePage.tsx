// ===== Home Page =====

import { useState } from 'react';
import { Pin, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGetPostsQuery } from '../store/api/qortiumApi';
import { QdnImage } from '../components/editor/QdnImage';
import { toPlainTextPreview } from '../services/rich-text/richText';

const HomePage = () => {
  const { data: posts, isLoading, error } = useGetPostsQuery();
  const [visibleCount, setVisibleCount] = useState(5);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filtered = (posts ?? []).filter((post) =>
    activeTag ? (post.tags ?? []).includes(activeTag) : true,
  );

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl bg-[var(--color-surface)] p-5 shadow-sm"
          >
            <div className="mb-3 h-5 w-2/3 rounded bg-[var(--color-surface-muted)]" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-[var(--color-surface-muted)]" />
              <div className="h-4 w-5/6 rounded bg-[var(--color-surface-muted)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
        <p className="text-red-400">
          Failed to load posts. Please try again later.
        </p>
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] p-8 text-center shadow-sm">
        <p className="text-[var(--color-text-muted)]">
          No posts have been published yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeTag && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-[var(--color-text-muted)]">
            Found {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={() => setActiveTag(null)}
            className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-medium text-white transition hover:bg-[var(--color-accent-hover)]"
          >
            #{activeTag} ✕
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-8 text-center shadow-sm">
          <Search className="mx-auto mb-2 h-10 w-10 text-slate-300" />
          <p className="text-[var(--color-text-muted)]">
            No posts match this tag.
          </p>
        </div>
      ) : (
        visible.map((post) => (
          <Link
            key={post.id}
            to={`/post/${post.id}`}
            className="block transition-transform hover:scale-[1.01]"
          >
            <article className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm transition-shadow hover:shadow-md">
          {/* Pin indicator */}
          {post.isPinned && (
            <div className="mb-2 flex items-center gap-1 text-xs font-medium text-amber-400">
              <Pin className="h-3 w-3" />
              Pinned Post
            </div>
          )}

          {/* Title */}
          <h2 className="mb-2 text-lg font-semibold leading-snug text-[var(--color-text-primary)]">
            {post.title}
          </h2>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {post.tags.map((tag: string) => (
                <button
                  key={tag}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveTag(activeTag === tag ? null : tag);
                  }}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                    activeTag === tag
                      ? 'border-cyan-500 bg-[var(--color-accent)] text-white'
                      : 'border-cyan-800 bg-cyan-950/50 text-cyan-400 hover:border-cyan-400'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* Content preview */}
          {post.coverImageRef && (
            <div className="mb-3 overflow-hidden rounded-lg">
              <QdnImage
                imageRef={post.coverImageRef}
                alt={post.title}
                className="h-40 w-full object-cover transition hover:scale-105"
                loading="lazy"
              />
            </div>
          )}
          <p className="mb-3 line-clamp-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {toPlainTextPreview(post.content)}
          </p>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text-secondary)]">
              {post.authorName}
            </span>
            <span>
              {post.createdAt
                ? new Date(post.createdAt).toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : 'Unknown'}
            </span>

          </div>
        </article>
        </Link>
      ))
      )}

      {/* Load More */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + 5)}
          className="w-full rounded-xl border-2 border-dashed border-slate-700 py-3 text-sm font-medium text-[var(--color-text-muted)] transition hover:border-cyan-300 hover:text-cyan-600"
        >
          Load More ({filtered.length - visible.length} remaining)
        </button>
      )}
    </div>
  );
};

export default HomePage;
