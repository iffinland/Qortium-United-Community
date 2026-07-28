// ===== New Thread Form =====

import { useState, type FormEvent } from 'react';
import { useCreateThreadMutation } from '../../store/api/forumApi';
import { useAppSelector } from '../../store';
import RichTextEditor from './RichTextEditor';

interface NewThreadFormProps {
  categoryId: string;
  onCancel: () => void;
  onSuccess: () => void;
}

const NewThreadForm = ({ categoryId, onCancel, onSuccess }: NewThreadFormProps) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [createThread, { isLoading }] = useCreateThreadMutation();
  const { name, address, isAuthenticated } = useAppSelector((s) => s.auth);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || isLoading) return;

    try {
      await createThread({
        categoryId,
        title: title.trim(),
        content: content.trim(),
        authorName: name || 'Anonymous',
        authorAddress: address || '',
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      }).unwrap();
      setTitle('');
      setContent('');
      setTags('');
      onSuccess();
    } catch { /* RTK handles */ }
  };

  if (!isAuthenticated) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
        Sign in to create a new thread.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">New Thread</h3>

      <div className="mb-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Thread title..."
          className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-white p-2.5 text-sm dark:bg-slate-900 dark:text-white"
          required
        />
      </div>

      <div className="mb-3">
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="Write your post using Markdown..."
          minRows={5}
        />
      </div>

      <div className="mb-3">
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags (comma separated)"
          className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-white p-2.5 text-sm dark:bg-slate-900 dark:text-white"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!title.trim() || !content.trim() || isLoading}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-50"
        >
          {isLoading ? 'Posting...' : 'Post Thread'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--color-border-subtle)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export default NewThreadForm;
