// ===== Home Page =====

import { useState } from 'react';
import { MessageCircle, Heart, Pin, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGetPostsQuery } from '../store/api/qortiumApi';

interface HomePageProps {
  searchQuery?: string;
}

const HomePage = ({ searchQuery = '' }: HomePageProps) => {
  const { data: posts, isLoading, error } = useGetPostsQuery();
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [visibleCount, setVisibleCount] = useState(5);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Combine search and tag filtering
  const searchActive = searchQuery.trim() || activeTag;

  const filtered = (posts ?? []).filter((post): boolean => {
    let match = true;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      match = match && (
        post.title.toLowerCase().includes(q) ||
        post.content.toLowerCase().includes(q) ||
        post.authorName.toLowerCase().includes(q)
      );
    }
    if (activeTag) {
      match = match && (post.tags ?? []).includes(activeTag);
    }
    return match;
  });

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const handleLike = (postId: string) => {
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
        setLikeCounts((c) => ({
          ...c,
          [postId]: (c[postId] ?? likeCounts[postId] ?? 0) - 1,
        }));
      } else {
        next.add(postId);
        setLikeCounts((c) => ({
          ...c,
          [postId]: (c[postId] ?? likeCounts[postId] ?? 0) + 1,
        }));
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl bg-white p-5 shadow-sm"
          >
            <div className="mb-3 h-5 w-2/3 rounded bg-slate-200" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-5/6 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">
          Failed to load posts. Please try again later.
        </p>
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">
        <p className="text-[var(--color-text-muted)]">
          No posts have been published yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search status */}
      {searchActive && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-[var(--color-text-muted)]">
            <Search className="mr-1 inline h-3.5 w-3.5" />
            Found {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </p>
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="rounded-full bg-cyan-500 px-2 py-0.5 text-[10px] font-medium text-white transition hover:bg-cyan-600"
            >
              #{activeTag} ✕
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-8 text-center shadow-sm">
          <Search className="mx-auto mb-2 h-10 w-10 text-slate-300" />
          <p className="text-[var(--color-text-muted)]">
            No posts match your search.
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
            <div className="mb-2 flex items-center gap-1 text-xs font-medium text-amber-600">
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
                      ? 'border-cyan-500 bg-cyan-500 text-white'
                      : 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:border-cyan-400 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-400'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* Content preview */}
          {post.imageUrl && (
            <div className="mb-3 overflow-hidden rounded-lg">
              <img
                src={post.imageUrl}
                alt={post.title}
                className="h-40 w-full object-cover transition hover:scale-105"
                loading="lazy"
              />
            </div>
          )}
          <p className="mb-3 line-clamp-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {post.content}
          </p>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text-secondary)]">
              {post.authorName}
            </span>
            <span>
              {new Date(post.createdAt).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>

            <div className="flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              <span>{post.commentsCount}</span>
            </div>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleLike(post.id);
              }}
              className={`flex items-center gap-1.5 transition ${
                likedPosts.has(post.id)
                  ? 'text-rose-500'
                  : 'hover:text-rose-400'
              }`}
              title={likedPosts.has(post.id) ? 'Unlike' : 'Like'}
            >
              <Heart
                className={`h-3.5 w-3.5 ${
                  likedPosts.has(post.id) ? 'fill-current' : ''
                }`}
              />
              <span>
                {post.likesCount + (likeCounts[post.id] ?? 0)}
              </span>
            </button>
          </div>
        </article>
        </Link>
      ))
      )}

      {/* Load More */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + 5)}
          className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-medium text-[var(--color-text-muted)] transition hover:border-cyan-300 hover:text-cyan-600 dark:border-slate-700"
        >
          Load More ({filtered.length - visible.length} remaining)
        </button>
      )}
    </div>
  );
};

export default HomePage;
