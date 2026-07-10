// ===== Comment Form Component =====

import { useState, type FormEvent } from 'react';
import { Send, X } from 'lucide-react';
import { useAddCommentMutation } from '../../store/api/qortiumApi';
import { useAppSelector } from '../../store';
import { createNotification } from '../../services/qortium/notificationService';

interface CommentFormProps {
  postId: string;
  parentCommentId?: string | null;
  replyToName?: string | null;
  onCancelReply?: () => void;
}

const CommentForm = ({
  postId,
  parentCommentId = null,
  replyToName = null,
  onCancelReply,
}: CommentFormProps) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addComment] = useAddCommentMutation();
  const { name, address, isAuthenticated } = useAppSelector(
    (state) => state.auth
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addComment({
        postId,
        content: trimmed,
        authorName: name || 'Anonymous',
        authorAddress: address || 'unknown',
        parentCommentId,
      }).unwrap();
      setContent('');
      onCancelReply?.();
      createNotification({
        type: 'new_comment',
        text: `${name || 'Someone'} commented on a post`,
        link: `/post/${postId}`,
      });
    } catch {
      /* error handled by RTK Query */
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {replyToName && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span>
            Replying to <strong className="text-cyan-600">{replyToName}</strong>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="relative">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            isAuthenticated
              ? 'Write a comment...'
              : 'Sign in to comment...'
          }
          disabled={!isAuthenticated || isSubmitting}
          rows={3}
          className="w-full resize-none rounded-lg border border-slate-200 bg-white p-3 pr-12 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!content.trim() || !isAuthenticated || isSubmitting}
          className="absolute bottom-3 right-3 rounded-md p-1.5 text-cyan-500 transition hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-30"
          title="Send comment"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {isSubmitting && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Publishing comment...
        </p>
      )}
    </form>
  );
};

export default CommentForm;
