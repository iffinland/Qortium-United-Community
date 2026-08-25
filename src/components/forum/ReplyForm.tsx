// ===== Reply Form (for forum threads) =====

import { useState, type FormEvent } from 'react';
import { Send, X } from 'lucide-react';
import { useAddReplyMutation } from '../../store/api/forumApi';
import { useAppSelector } from '../../store';
import { RichTextEditor } from '../editor/RichTextEditor';

interface ReplyFormProps {
  threadId: string;
  parentReplyId?: string | null;
  replyToName?: string | null;
  onCancel?: () => void;
}

const ReplyForm = ({
  threadId,
  parentReplyId = null,
  replyToName = null,
  onCancel,
}: ReplyFormProps) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addReply] = useAddReplyMutation();
  const { name, address, isAuthenticated } = useAppSelector((s) => s.auth);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await addReply({
        threadId,
        content: content.trim(),
        authorName: name || 'Anonymous',
        authorAddress: address || '',
        parentReplyId,
      }).unwrap();
      setContent('');
      onCancel?.();
    } catch { /* RTK handles */ }
    finally { setIsSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {replyToName && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          Replying to <strong className="text-cyan-600">{replyToName}</strong>
          {onCancel && (
            <button type="button" onClick={onCancel} className="rounded p-0.5 hover:bg-slate-800">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      <div className="space-y-2">
        <RichTextEditor
          value={content}
          onChange={setContent}
          ownerName={name || ''}
          placeholder={isAuthenticated ? 'Write a reply...' : 'Sign in to reply'}
          disabled={!isAuthenticated || isSubmitting}
          minRows={2}
        />
        <button
          type="submit"
          disabled={!content.trim() || isSubmitting}
          className="rounded p-1 text-cyan-500 transition hover:bg-cyan-950 disabled:opacity-30"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
};

export default ReplyForm;
