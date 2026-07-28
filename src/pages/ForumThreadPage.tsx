// ===== Forum Thread Detail Page =====

import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, MessageSquare } from 'lucide-react';
import { useGetThreadQuery } from '../store/api/forumApi';
import { parseMarkdown } from '../services/forum/markdown';
import ThreadReplyTree from '../components/forum/ThreadReplyTree';
import ReplyForm from '../components/forum/ReplyForm';

const ForumThreadPage = () => {
  const { threadId } = useParams<{ threadId: string }>();
  const { data: result, isLoading, error } = useGetThreadQuery(threadId || '');

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

  if (error || !result?.thread) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
        <p className="text-red-700 dark:text-red-400">Thread not found.</p>
        <Link to="/forum" className="mt-2 inline-block text-sm text-cyan-600">Back to Forum</Link>
      </div>
    );
  }

  const thread = result.thread;
  const replyCount = thread.replies?.length ?? 0;

  return (
    <div className="space-y-6">
      <Link
        to={`/forum/${thread.categoryId}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to threads
      </Link>

      {/* Incomplete notice */}
      {result.completeness === 'incomplete' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
          Some Forum resources could not be loaded. The visible results may be incomplete.
        </div>
      )}

      {/* Thread header */}
      <article className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
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
          {replyCount > 0 && (
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{replyCount} replies</span>
          )}
        </div>

        <div className="prose prose-slate max-w-none">
          {parseMarkdown(thread.content)}
        </div>
      </article>

      {/* Replies */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">
          Replies ({replyCount})
        </h2>

        <div className="mb-4">
          <ReplyForm threadId={thread.id} />
        </div>

        <ThreadReplyTree
          replies={thread.replies ?? []}
          threadId={thread.id}
        />
      </section>
    </div>
  );
};

export default ForumThreadPage;
