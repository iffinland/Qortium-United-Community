// ===== Forum Thread Detail Page =====

import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Eye, MessageSquare, Lock, Pin } from 'lucide-react';
import { useGetThreadQuery } from '../store/api/forumApi';
import { parseMarkdown } from '../services/forum/markdown';
import ThreadReplyTree from '../components/forum/ThreadReplyTree';
import ReplyForm from '../components/forum/ReplyForm';

const ForumThreadPage = () => {
  const { threadId } = useParams<{ threadId: string }>();
  const { data: thread, isLoading, error } = useGetThreadQuery(threadId || '');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse rounded-xl bg-[var(--color-surface-card)] p-6">
          <div className="mb-3 h-6 w-2/3 rounded bg-slate-200" />
          <div className="space-y-2"><div className="h-4 w-full rounded bg-slate-100" /><div className="h-4 w-5/6 rounded bg-slate-100" /></div>
        </div>
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
        <p className="text-red-700 dark:text-red-400">Thread not found.</p>
        <Link to="/forum" className="mt-2 inline-block text-sm text-cyan-600">Back to Forum</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/forum/${thread.categoryId}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to threads
      </Link>

      {/* Thread header */}
      <article className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {thread.isPinned && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
              <Pin className="h-3 w-3" /> Pinned
            </span>
          )}
          {thread.isLocked && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              <Lock className="h-3 w-3" /> Locked
            </span>
          )}
          {thread.tags?.map((t) => (
            <span key={t} className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-400">
              #{t}
            </span>
          ))}
        </div>

        <h1 className="mb-3 text-2xl font-bold text-[var(--color-text-primary)]">
          {thread.title}
        </h1>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[11px] font-bold text-white">
              {thread.authorName.slice(0, 2).toUpperCase()}
            </div>
            <span className="font-medium text-[var(--color-text-secondary)]">{thread.authorName}</span>
          </div>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(thread.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{thread.viewCount}</span>
          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{thread.replyCount} replies</span>
        </div>

        <div className="prose prose-slate max-w-none">
          {parseMarkdown(thread.content)}
        </div>
      </article>

      {/* Replies */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">
          Replies ({(thread.replies ?? []).length})
        </h2>

        {/* New reply form */}
        {!thread.isLocked && (
          <div className="mb-4">
            <ReplyForm threadId={thread.id} />
          </div>
        )}

        {thread.isLocked && (
          <p className="mb-4 text-sm italic text-[var(--color-text-muted)]">
            This thread is locked. No new replies can be added.
          </p>
        )}

        {/* Reply tree */}
        <ThreadReplyTree
          replies={thread.replies ?? []}
          threadId={thread.id}
        />
      </section>
    </div>
  );
};

export default ForumThreadPage;
