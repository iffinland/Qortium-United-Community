// ===== Post Detail Page =====

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Pin, Clock, Share2, Check } from 'lucide-react';
import { useGetPostQuery } from '../store/api/qortiumApi';
import CommentList from '../components/forum/CommentList';
import CommentForm from '../components/forum/CommentForm';
import { RichTextContent } from '../components/editor/RichTextContent';
import { QdnImagePreview } from '../components/common/QdnImagePreview';

const PostDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: post, isLoading, error } = useGetPostQuery(id || '');
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse rounded-xl bg-[var(--color-surface)] p-6 shadow-sm">
          <div className="mb-4 h-6 w-2/3 rounded bg-[var(--color-surface-muted)]" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-[var(--color-surface-muted)]" />
            <div className="h-4 w-5/6 rounded bg-[var(--color-surface-muted)]" />
            <div className="h-4 w-4/6 rounded bg-[var(--color-surface-muted)]" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
        <p className="mb-3 text-red-400">
          {typeof error === 'string' ? error : 'Post not found.'}
        </p>
        <Link
          to="/"
          className="text-sm font-medium text-cyan-600 hover:text-cyan-300"
        >
          &larr; Back to Home
        </Link>
      </div>
    );
  }

  const mainImageRef = post.coverImageRef ?? null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Link>

      {/* Post content */}
      <article className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        {post.isPinned && (
          <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-amber-400">
            <Pin className="h-3.5 w-3.5" />
            Pinned Post
          </div>
        )}

        <h1 className="mb-3 text-2xl font-bold leading-tight text-[var(--color-text-primary)]">
          {post.title}
        </h1>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span className="font-medium text-[var(--color-text-secondary)]">
            {post.authorName}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {post.createdAt
              ? new Date(post.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Unknown'}
          </span>
        </div>

        {/* Desktop two-area composition: a bounded contain-fitted image
            preview sits alongside the body, while the title/meta above span
            the full content area. On narrow screens both stack vertically. */}
        <div className="gap-6 lg:flex">
          {mainImageRef && (
            <div className="mb-4 shrink-0 lg:mb-0 lg:w-[320px] xl:w-[400px]">
              <QdnImagePreview
                imageRef={mainImageRef}
                alt={post.title}
                previewClassName="max-h-[420px] w-auto max-w-full rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] object-contain"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <RichTextContent
              value={post.content}
              skipFirstImage={Boolean(mainImageRef)}
            />
          </div>
        </div>

        {/* Post stats */}
        <div className="mt-6 flex items-center gap-4 border-t border-slate-700 pt-4 text-sm text-[var(--color-text-muted)]">
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4" />
            <span>{post.comments?.length ?? 0} comments</span>
          </div>
          {/* Share button */}
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 transition hover:text-cyan-500"
            title="Copy link"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-500" />
                <span className="text-emerald-500">Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" />
                <span>Share</span>
              </>
            )}
          </button>
        </div>
      </article>

      {/* Comments section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">
          Comments ({(post.comments ?? []).length})
        </h2>

        <CommentForm postId={post.id} />

        <div className="mt-4">
          <CommentList comments={post.comments ?? []} postId={post.id} />
        </div>
      </section>
    </div>
  );
};

export default PostDetailPage;
