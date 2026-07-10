// ===== Forum Category Page – Threads =====

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pin, MessageSquare, Eye, Plus } from 'lucide-react';
import { useGetCategoriesQuery, useGetThreadsQuery } from '../store/api/forumApi';
import type { ForumThread } from '../types/forum';
import NewThreadForm from '../components/forum/NewThreadForm';

const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

const ForumCategoryPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { data: categories } = useGetCategoriesQuery();
  const { data: threads, isLoading } = useGetThreadsQuery(categoryId || '');
  const [showNewThread, setShowNewThread] = useState(false);

  const category = categories?.find((c) => c.id === categoryId);
  const pinned = (threads ?? []).filter((t) => t.isPinned);
  const normal = (threads ?? []).filter((t) => !t.isPinned);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg bg-[var(--color-surface-card)] p-4">
            <div className="h-4 w-2/3 rounded bg-slate-200" />
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
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-700"
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

      {/* Pinned threads */}
      {pinned.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Pinned
          </p>
          {pinned.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} pinned />
          ))}
        </div>
      )}

      {/* Normal threads */}
      <div className="space-y-1">
        {normal.length === 0 && pinned.length === 0 ? (
          <div className="rounded-lg bg-[var(--color-surface-card)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">No threads yet. Start a conversation!</p>
          </div>
        ) : (
          normal.map((thread) => <ThreadRow key={thread.id} thread={thread} />)
        )}
      </div>
    </div>
  );
};

const ThreadRow = ({ thread, pinned = false }: { thread: ForumThread; pinned?: boolean }) => (
  <Link
    to={`/forum/${thread.categoryId}/${thread.id}`}
    className={`flex items-center gap-3 rounded-lg p-3 transition hover:bg-[var(--color-surface-card)] hover:shadow-sm ${
      pinned ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''
    }`}
  >
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[10px] font-bold text-white">
      {thread.authorName.slice(0, 2).toUpperCase()}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        {pinned && <Pin className="h-3 w-3 shrink-0 text-amber-500" />}
        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
          {thread.title}
        </p>
        {thread.tags?.map((t: string) => (
          <span key={t} className="hidden rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] sm:inline dark:bg-slate-800">
            {t}
          </span>
        ))}
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        by {thread.authorName} · {timeAgo(thread.createdAt)} ago
      </p>
    </div>
    <div className="hidden shrink-0 items-center gap-3 text-xs text-[var(--color-text-muted)] sm:flex">
      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{thread.replyCount}</span>
      <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{thread.viewCount}</span>
    </div>
    {thread.isLocked && (
      <span className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 dark:border-slate-700">Locked</span>
    )}
  </Link>
);

export default ForumCategoryPage;
