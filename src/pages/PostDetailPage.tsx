// ===== Post Detail Page =====

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Heart, Pin, Clock, Share2, Check } from 'lucide-react';
import { useGetPostQuery } from '../store/api/qortiumApi';
import CommentList from '../components/forum/CommentList';
import CommentForm from '../components/forum/CommentForm';
import { parseMarkdown } from '../services/forum/markdown';

const PostDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: post, isLoading, error } = useGetPostQuery(id || '');
  const [liked, setLiked] = useState(false);
  const [likeOffset, setLikeOffset] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleLike = () => {
    if (liked) {
      setLiked(false);
      setLikeOffset((o) => o - 1);
    } else {
      setLiked(true);
      setLikeOffset((o) => o + 1);
    }
  };

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
        <div className="animate-pulse rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 h-6 w-2/3 rounded bg-slate-200" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-slate-100" />
            <div className="h-4 w-5/6 rounded bg-slate-100" />
            <div className="h-4 w-4/6 rounded bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="mb-3 text-red-700">
          {typeof error === 'string' ? error : 'Post not found.'}
        </p>
        <Link
          to="/"
          className="text-sm font-medium text-cyan-600 hover:text-cyan-800"
        >
          &larr; Back to Home
        </Link>
      </div>
    );
  }

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
          <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <Pin className="h-3.5 w-3.5" />
            Pinned Post
          </div>
        )}

        <h1 className="mb-3 text-2xl font-bold leading-tight text-[var(--color-text-primary)]">
          {post.title}
        </h1>

        {/* Cover image */}
        {post.coverMediaUrl && (
          <div className="mb-4 overflow-hidden rounded-xl">
            <img
              src={post.coverMediaUrl}
              alt={post.title}
              className="max-h-96 w-full object-cover"
            />
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span className="font-medium text-[var(--color-text-secondary)]">
            {post.authorName}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(post.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        <div className="prose prose-slate max-w-none">
          {parseMarkdown(post.content)}
        </div>

        {/* Post stats */}
        <div className="mt-6 flex items-center gap-4 border-t border-slate-100 pt-4 text-sm text-[var(--color-text-muted)]">
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4" />
            <span>{post.comments?.length ?? post.commentsCount} comments</span>
          </div>
          <button
            onClick={handleLike}
            className={`flex items-center gap-1.5 transition ${
              liked ? 'text-rose-500' : 'hover:text-rose-400'
            }`}
          >
            <Heart
              className={`h-4 w-4 ${liked ? 'fill-current' : ''}`}
            />
            <span>{post.likesCount + likeOffset} likes</span>
          </button>

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
