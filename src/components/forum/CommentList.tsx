// ===== Comment List Component =====

import { useState } from 'react';
import type { Comment } from '../../types';
import { MessageCircle, Reply } from 'lucide-react';
import CommentForm from './CommentForm';

interface CommentListProps {
  comments: Comment[];
  postId?: string;
}

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const CommentItem = ({
  comment,
  postId,
  allComments,
}: {
  comment: Comment;
  postId: string;
  allComments: Comment[];
}) => {
  const [showReply, setShowReply] = useState(false);
  const replies = allComments.filter((c) => c.parentCommentId === comment.id);

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-4 shadow-sm dark:bg-slate-900">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[11px] font-bold text-white">
            {comment.authorName
              .split(' ')
              .map((p) => p[0]?.toUpperCase() ?? '')
              .join('')
              .slice(0, 2)}
          </div>
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {comment.authorName}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {formatDate(comment.createdAt)}
          </span>
        </div>
        {comment.parentCommentId && (
          <p className="mb-1 pl-9 text-xs text-[var(--color-text-muted)]">
            In reply to a comment
          </p>
        )}
        <p className="pl-9 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {comment.content}
        </p>
        <div className="mt-2 pl-9">
          <button
            onClick={() => setShowReply(!showReply)}
            className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] transition hover:text-cyan-500"
          >
            <Reply className="h-3 w-3" />
            Reply
          </button>
        </div>
      </div>

      {/* Reply form */}
      {showReply && (
        <div className="ml-8">
          <CommentForm
            postId={postId}
            parentCommentId={comment.id}
            replyToName={comment.authorName}
            onCancelReply={() => setShowReply(false)}
          />
        </div>
      )}

      {/* Nested replies */}
      {replies.length > 0 && (
        <div className="ml-6 space-y-2 border-l-2 border-[var(--color-border-subtle)] pl-4">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              postId={postId}
              allComments={allComments}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CommentList = ({ comments, postId = '' }: CommentListProps) => {
  const topLevel = comments.filter((c) => !c.parentCommentId);

  if (comments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border-subtle)] bg-slate-50/50 p-6 text-center dark:bg-slate-800/30">
        <MessageCircle className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm text-[var(--color-text-muted)]">
          No comments yet. Be the first to comment!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {topLevel.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          postId={postId}
          allComments={comments}
        />
      ))}
    </div>
  );
};

export default CommentList;
