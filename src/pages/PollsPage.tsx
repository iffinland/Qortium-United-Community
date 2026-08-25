// ===== Polls Page – User-Facing Participation & Results =====
//
// Poll creation and closure are Admin-panel operations. This page is
// intentionally read/participate only.

import { Clock, Vote } from 'lucide-react';
import { useGetPollsQuery, useSubmitVoteMutation } from '../store/api/pollApi';
import { useAppSelector } from '../store';

const PollsPage = () => {
  const { address, name, isAuthenticated } = useAppSelector((state) => state.auth);
  const { data: pollData, isLoading } = useGetPollsQuery(address ?? '');
  const [submitVote] = useSubmitVoteMutation();

  const polls = pollData?.polls ?? [];
  const completeness = pollData?.completeness;

  const handleVote = async (pollId: string, optionId: string) => {
    try {
      await submitVote({
        pollEntityId: pollId,
        optionId,
        ownerName: name || '',
        ownerAddress: address ?? '',
      }).unwrap();
    } catch {
      // Voting errors are non-blocking; results reload on the next query.
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((item) => (
          <div key={item} className="animate-pulse rounded-xl bg-[var(--color-surface)] p-5 shadow-sm">
            <div className="mb-3 h-5 w-2/3 rounded bg-[var(--color-surface-muted)]" />
            <div className="space-y-2">
              <div className="h-10 rounded bg-[var(--color-surface-muted)]" />
              <div className="h-10 rounded bg-[var(--color-surface-muted)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Polls & Surveys</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Participate in community decisions</p>
      </div>

      {completeness === 'incomplete' && (
        <div className="rounded-lg border border-amber-800 bg-amber-950 p-3 text-sm text-amber-400">
          Some poll resources could not be loaded. Results may be incomplete.
        </div>
      )}
      {completeness === 'unavailable' && (
        <div className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-400">
          Polls are currently unavailable.
        </div>
      )}

      {polls.length === 0 && completeness !== 'unavailable' && (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-8 text-center shadow-sm">
          <p className="text-sm text-[var(--color-text-muted)]">No polls yet.</p>
        </div>
      )}

      {polls.map((poll) => {
        const maxVotes = Math.max(...poll.options.map((option) => option.voteCount), 1);
        const isOpen =
          !poll.isClosed &&
          (!poll.expiresAt || new Date(poll.expiresAt) > new Date());

        return (
          <div key={poll.id} className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                  {poll.question}
                </h2>
                {poll.description && (
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{poll.description}</p>
                )}
              </div>
              {!isOpen && (
                <span className="shrink-0 rounded-full border border-slate-700 bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-xs font-medium text-slate-400">
                  {poll.isClosed ? 'Closed' : 'Expired'}
                </span>
              )}
            </div>

            {poll.options.map((option) => (
              <button
                key={option.optionId}
                onClick={() => {
                  if (isOpen && isAuthenticated) handleVote(poll.id, option.optionId);
                }}
                disabled={!isOpen || !isAuthenticated}
                className={`mb-2 w-full rounded-lg border p-3 text-left transition ${
                  !isOpen
                    ? 'cursor-default border-slate-700 bg-[var(--color-surface-muted)]'
                    : 'cursor-pointer border-[var(--color-border-subtle)] hover:border-cyan-300 hover:bg-cyan-50/30'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
                    {option.voteCount} vote{option.voteCount !== 1 ? 's' : ''}
                    {option.percentage !== null && ` (${option.percentage}%)`}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-[var(--color-accent)] transition-all"
                    style={{ width: `${Math.round((option.voteCount / maxVotes) * 100)}%` }}
                  />
                </div>
              </button>
            ))}

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1">
                <Vote className="h-3.5 w-3.5" /> {poll.totalVotes} total
              </span>
              {poll.expiresAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Ends{' '}
                  {new Date(poll.expiresAt).toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
              <span>
                by <span className="font-medium">{poll.ownerName}</span>
              </span>
              {!poll.resultsComplete && <span className="text-amber-400">Results may be incomplete</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PollsPage;
