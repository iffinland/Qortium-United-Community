// ===== Admin Poll Manager =====
//
// Self-contained Poll management section: create, list, and canonical close.
// Polls have no destructive delete; closure is the canonical lifecycle state.

import { useState, type FormEvent } from 'react';
import { CheckCircle2, BarChart3, Plus, X, Lock } from 'lucide-react';
import {
  useGetPollsQuery,
  useCreatePollMutation,
  useClosePollMutation,
  type PollView,
} from '../../store/api/pollApi';
import { useAppSelector } from '../../store';
import { AdminSection } from './AdminSection';

const PollManager = () => {
  const { address, name } = useAppSelector((state) => state.auth);
  const { data: pollData } = useGetPollsQuery(address ?? '');
  const [createPoll, { isLoading: isCreating }] = useCreatePollMutation();
  const [closePoll] = useClosePollMutation();

  const polls = pollData?.polls ?? [];

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [expiresAt, setExpiresAt] = useState('');
  const [allowVoteChange, setAllowVoteChange] = useState(true);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => setFeedback(null), 5000);
  };

  const resetCreate = () => {
    setQuestion('');
    setDescription('');
    setOptions(['', '']);
    setExpiresAt('');
    setAllowVoteChange(true);
    setShowCreate(false);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const valid = options.filter((option) => option.trim());
    if (!question.trim() || valid.length < 2) return;
    if (!name || !address) {
      showFeedback('error', 'Publisher identity is unavailable. Reload and try again.');
      return;
    }

    try {
      await createPoll({
        question: question.trim(),
        description: description.trim() || undefined,
        options: valid.map((label, index) => ({
          optionId: `po-${Date.now().toString(36)}-${index}`,
          label: label.trim(),
        })),
        expiresAt: expiresAt || undefined,
        allowVoteChange,
        ownerName: name,
        ownerAddress: address,
      }).unwrap();
      resetCreate();
      showFeedback('success', 'Poll created.');
    } catch (error) {
      console.error('Failed to create poll:', error);
      showFeedback('error', error instanceof Error ? error.message : 'Failed to create poll.');
    }
  };

  const handleClose = async (poll: PollView) => {
    if (!window.confirm('Close this poll permanently?')) return;
    try {
      await closePoll({
        pollEntityId: poll.id,
        question: poll.question,
        description: poll.description,
        options: poll.options.map((option) => ({ optionId: option.optionId, label: option.label })),
        expiresAt: poll.expiresAt ? new Date(poll.expiresAt).getTime() : undefined,
        allowVoteChange: poll.allowVoteChange,
        ownerName: poll.ownerName,
        ownerAddress: poll.ownerAddress,
      }).unwrap();
      showFeedback('success', 'Poll closed.');
    } catch (error) {
      console.error('Failed to close poll:', error);
      showFeedback('error', error instanceof Error ? error.message : 'Failed to close poll.');
    }
  };

  return (
    <AdminSection
      title="Polls"
      description="Create and close community polls."
      action={
        <button
          type="button"
          onClick={() => setShowCreate((current) => !current)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          <Plus className="h-3.5 w-3.5" /> New Poll
        </button>
      }
    >
      {feedback && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-800 bg-emerald-950 text-emerald-400'
              : 'border-red-800 bg-red-950 text-red-400'
          }`}
        >
          {feedback.type === 'success' && <CheckCircle2 className="mr-1.5 inline h-4 w-4" />}
          {feedback.message}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <BarChart3 className="h-4 w-4 text-cyan-500" />
            Create a New Poll
          </h3>

          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Poll question..."
            className="mb-3 w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] p-2.5 text-sm"
            required
          />
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (optional)"
            className="mb-3 w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] p-2.5 text-sm"
          />

          {options.map((option, index) => (
            <div key={index} className="mb-2 flex gap-2">
              <input
                type="text"
                value={option}
                onChange={(event) => {
                  const next = [...options];
                  next[index] = event.target.value;
                  setOptions(next);
                }}
                placeholder={`Option ${index + 1}`}
                className="flex-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] p-2 text-sm"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptions(options.filter((_, itemIndex) => itemIndex !== index))}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setOptions([...options, ''])}
            className="mb-3 text-xs text-cyan-600"
          >
            + Add option
          </button>

          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] p-2 text-sm"
            />
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={allowVoteChange}
                onChange={(event) => setAllowVoteChange(event.target.checked)}
              />
              Allow changes
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isCreating || !question.trim() || options.filter((option) => option.trim()).length < 2}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Publish Poll'}
            </button>
            <button
              type="button"
              onClick={resetCreate}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <BarChart3 className="h-4 w-4 text-cyan-500" />
          Existing Polls
        </h3>

        {polls.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No polls to manage.</p>
        ) : (
          <div className="space-y-3">
            {polls.map((poll) => (
              <div
                key={poll.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-border-subtle)] p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                    {poll.question}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {poll.isClosed ? 'Closed' : 'Open'} · {poll.totalVotes} votes · {poll.ownerName}
                  </p>
                </div>
                {poll.isOwner && !poll.isClosed && (
                  <button
                    type="button"
                    onClick={() => handleClose(poll)}
                    className="shrink-0 rounded-full border border-rose-800 bg-rose-950 px-2.5 py-0.5 text-xs font-medium text-rose-400 hover:bg-rose-800"
                  >
                    Close
                  </button>
                )}
                {!poll.isOwner && (
                  <span title="Only the canonical owner can close this poll">
                    <Lock className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminSection>
  );
};

export default PollManager;
