// ===== New Ticket Form =====

import { useState, type FormEvent } from 'react';
import { Bug, Lightbulb, HelpCircle, MessageSquare } from 'lucide-react';
import { useCreateTicketMutation } from '../../store/api/supportApi';
import { useAppSelector } from '../../store';
import { RichTextEditor } from '../editor/RichTextEditor';
import type { TicketType } from '../../types/support';
import { useGetCategoriesQuery } from '../../store/api/supportApi';

interface NewTicketFormProps {
  onCancel: () => void;
  onSuccess: () => void;
}

const typeOptions: { value: TicketType; label: string; icon: typeof Bug; desc: string }[] = [
  { value: 'bug', label: 'Bug Report', icon: Bug, desc: 'Something is not working correctly' },
  { value: 'feature', label: 'Feature Request', icon: Lightbulb, desc: 'Suggest a new feature or improvement' },
  { value: 'question', label: 'Question', icon: HelpCircle, desc: 'Ask how something works' },
  { value: 'general', label: 'General', icon: MessageSquare, desc: 'Anything else' },
];

const NewTicketForm = ({ onCancel, onSuccess }: NewTicketFormProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TicketType>('bug');
  const [categoryId, setCategoryId] = useState('');
  const [createTicket, { isLoading }] = useCreateTicketMutation();
  const { name, address, isAuthenticated } = useAppSelector((s) => s.auth);
  const { data: catData, isLoading: catLoading, error: catError } = useGetCategoriesQuery();
  const activeCategories = (catData?.categories ?? []).filter(c => c.isActive);
  const completeness = catData?.completeness;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !categoryId || isLoading) return;
    try {
      await createTicket({
        title: title.trim(),
        description: description.trim(),
        type,
        categoryId,
        authorName: name || 'Anonymous',
        authorAddress: address || '',
      }).unwrap();
      setTitle('');
      setDescription('');
      onSuccess();
    } catch { /* handled by RTK Query */ }
  };

  if (!isAuthenticated) {
    return (
      <div className="rounded-lg border border-amber-800 bg-amber-950 p-4 text-sm text-amber-400">
        Sign in to create a support ticket.
      </div>
    );
  }

  if (catLoading) {
    return (
      <div className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-40 rounded bg-[var(--color-surface-muted)]" />
          <div className="h-10 rounded bg-[var(--color-surface-muted)]" />
        </div>
      </div>
    );
  }

  // Determine category state for UI
  const categoryState: 'unavailable' | 'incomplete' | 'empty' | 'ready' =
    catError ? 'unavailable'
    : completeness === 'unavailable' ? 'unavailable'
    : completeness === 'incomplete' ? 'incomplete'
    : activeCategories.length === 0 ? 'empty'
    : 'ready';

  const publicationBlocked = categoryState === 'unavailable' || categoryState === 'empty';

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
        New Support Ticket
      </h3>

      {/* Type selector */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {typeOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setType(opt.value)}
            className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition ${
              type === opt.value
                ? 'border-cyan-600 bg-cyan-950'
                : 'border-[var(--color-border-subtle)] hover:border-slate-600'
            }`}
          >
            <opt.icon className={`h-5 w-5 ${type === opt.value ? 'text-cyan-600' : 'text-[var(--color-text-muted)]'}`} />
            <span className="text-[11px] font-medium text-[var(--color-text-primary)]">
              {opt.label}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ticket title..."
          className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-2.5 text-sm text-white"
          required
        />
      </div>

      <div className="mb-3">
        <RichTextEditor
          value={description}
          onChange={setDescription}
          ownerName={name || ''}
          placeholder="Describe the issue or idea in detail..."
          minRows={5}
        />
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Category:</label>
        {categoryState === 'unavailable' && (
          <p className="rounded border border-red-800 bg-red-950 p-2 text-xs text-red-400">
            Support categories are currently unavailable. Please try again later.
          </p>
        )}
        {categoryState === 'empty' && (
          <p className="text-xs text-amber-400">
            No active support categories are configured. An admin must create categories first.
          </p>
        )}
        {categoryState === 'incomplete' && (
          <p className="mb-1 text-xs text-amber-400">
            Category list may be incomplete — results shown below.
          </p>
        )}
        {(categoryState === 'ready' || categoryState === 'incomplete') && activeCategories.length > 0 && (
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-2.5 text-sm text-white" required>
            <option value="">Select a category...</option>
            {activeCategories.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        )}
        {categoryState === 'incomplete' && activeCategories.length === 0 && (
          <p className="text-xs text-amber-400">
            No active categories found in incomplete results. Retry when discovery completes.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={!title.trim() || !description.trim() || !categoryId || isLoading || publicationBlocked}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
          {isLoading ? 'Submitting...' : 'Submit Ticket'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-[var(--color-border-subtle)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition hover:bg-slate-800">
          Cancel
        </button>
      </div>
    </form>
  );
};

export default NewTicketForm;
