// ===== Forum Category Page – Threads =====

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { useGetCategoriesQuery, useGetThreadsQuery } from '../store/api/forumApi';
import type { ForumThread } from '../types/forum';
import NewThreadForm from '../components/forum/NewThreadForm';

const timeAgo = (d: string | null) => {
  if (!d) return 'Unknown';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  const diff = Date.now() - parsed.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

const ForumCategoryPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { data: categories } = useGetCategoriesQuery();
  const { data: result, isLoading } = useGetThreadsQuery(categoryId || '');
  const [showNewThread, setShowNewThread] = useState(false);

  const category = categories?.find((c) => c.id === categoryId);
  const threads = result?.topics ?? [];
  const completeness = result?.completeness;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg bg-[var(--color-surface-card)] p-4">
            <div className="h-4 w-2/3 rounded bg-[var(--color-surface-muted)]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        to="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Forum
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
            {category?.icon} {category?.name || categoryId}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {category?.description}
          </p>
        </div>
        <button
          onClick={() => setShowNewThread(!showNewThread)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent-hover)]"
        >
          <Plus className="h-4 w-4" />
          New Thread
        </button>
      </div>

      {showNewThread && (
        <NewThreadForm
          categoryId={categoryId || ''}
          onCancel={() => setShowNewThread(false)}
          onSuccess={() => setShowNewThread(false)}
        />
      )}

      {/* Incomplete notice */}
      {completeness === 'incomplete' && (
        <div className="rounded-lg border border-amber-800 bg-amber-950 p-3 text-sm text-amber-400">
          Some Forum resources could not be loaded. The visible results may be incomplete.
        </div>
      )}

      {/* Threads */}
      <div className="space-y-1">
        {threads.length === 0 ? (
          <div className="rounded-lg bg-[var(--color-surface-card)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">No threads yet. Start a conversation!</p>
          </div>
        ) : (
          threads.map((thread) => <ThreadRow key={thread.id} thread={thread} />)
        )}
      </div>
    </div>
  );
};

const ThreadRow = ({ thread }: { thread: ForumThread }) => (
  <Link
    to={`/forum/${thread.categoryId}/${thread.id}`}
    className="flex items-center gap-3 rounded-lg p-3 transition hover:bg-[var(--color-surface-card)] hover:shadow-sm"
  >
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-[var(--color-accent)] text-[10px] font-bold text-white">
      {thread.authorName.slice(0, 2).toUpperCase()}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
          {thread.title}
        </p>
        {thread.tags?.map((t: string) => (
          <span key={t} className="hidden rounded-full bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] sm:inline">
            {t}
          </span>
        ))}
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        by {thread.authorName} · {timeAgo(thread.createdAt) === 'Unknown' ? 'time unknown' : `${timeAgo(thread.createdAt)} ago`}
      </p>
    </div>
  </Link>
);

export default ForumCategoryPage;
