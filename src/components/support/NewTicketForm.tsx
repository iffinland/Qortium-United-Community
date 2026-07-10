// ===== New Ticket Form =====

import { useState, type FormEvent } from 'react';
import { Bug, Lightbulb, HelpCircle, MessageSquare } from 'lucide-react';
import { useCreateTicketMutation } from '../../store/api/supportApi';
import { useAppSelector } from '../../store';
import RichTextEditor from '../forum/RichTextEditor';
import type { TicketType, TicketPriority } from '../../types/support';

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
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [createTicket, { isLoading }] = useCreateTicketMutation();
  const { name, address, isAuthenticated } = useAppSelector((s) => s.auth);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || isLoading) return;
    try {
      await createTicket({
        title: title.trim(),
        description: description.trim(),
        type,
        priority,
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
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
        Sign in to create a support ticket.
      </div>
    );
  }

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
                ? 'border-cyan-400 bg-cyan-50 dark:border-cyan-600 dark:bg-cyan-950'
                : 'border-[var(--color-border-subtle)] hover:border-slate-300 dark:hover:border-slate-600'
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
          className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-white p-2.5 text-sm dark:bg-slate-900 dark:text-white"
          required
        />
      </div>

      <div className="mb-3">
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder="Describe the issue or idea in detail..."
          minRows={5}
        />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <label className="text-xs font-medium text-[var(--color-text-muted)]">Priority:</label>
        {(['low', 'medium', 'high'] as TicketPriority[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPriority(p)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
              priority === p
                ? p === 'high' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
                : p === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                : 'bg-slate-50 text-[var(--color-text-muted)] hover:bg-slate-100 dark:bg-slate-800'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={!title.trim() || !description.trim() || isLoading}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-50">
          {isLoading ? 'Submitting...' : 'Submit Ticket'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-[var(--color-border-subtle)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition hover:bg-slate-50 dark:hover:bg-slate-800">
          Cancel
        </button>
      </div>
    </form>
  );
};

export default NewTicketForm;
