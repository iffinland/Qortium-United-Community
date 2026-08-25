// ===== Comment Form Component =====

import { useState, type FormEvent } from 'react';
import { Send, X } from 'lucide-react';
import { useAddCommentMutation } from '../../store/api/qortiumApi';
import { useAppSelector } from '../../store';
import { RichTextEditor } from '../editor/RichTextEditor';

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
            className="rounded p-0.5 hover:bg-slate-800"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="space-y-2">
        <RichTextEditor
          value={content}
          onChange={setContent}
          ownerName={name || ''}
          placeholder={isAuthenticated ? 'Write a comment...' : 'Sign in to comment...'}
          disabled={!isAuthenticated || isSubmitting}
          minRows={3}
        />
        <button
          type="submit"
          disabled={!content.trim() || !isAuthenticated || isSubmitting}
          className="rounded-md p-1.5 text-cyan-500 transition hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-30"
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
