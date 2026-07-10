// ===== Polls Page =====

import { useState } from 'react';
import { Clock, Vote, CheckCircle2, Lock } from 'lucide-react';
import { useGetPollsQuery, useVotePollMutation } from '../store/api/qortiumApi';
import { useAppSelector } from '../store';
import { createNotification } from '../services/qortium/notificationService';
import type { Poll, PollOption } from '../types';

const PollsPage = () => {
  const { data: polls, isLoading, error } = useGetPollsQuery();
  const [votePoll, { isLoading: isVoting }] = useVotePollMutation();
  const { address, isAuthenticated, role } = useAppSelector((state) => state.auth);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [votedPolls, setVotedPolls] = useState<Set<string>>(new Set());
  const [voteFeedback, setVoteFeedback] = useState<Record<string, string>>({});
  const [closedPolls, setClosedPolls] = useState<Set<string>>(new Set());

  const isAdminRole = ['SysOp', 'SuperAdmin', 'Admin'].includes(role);

  const handleClosePoll = (pollId: string) => {
    setClosedPolls((prev) => new Set(prev).add(pollId));
    setVoteFeedback((prev) => ({ ...prev, [pollId]: 'Poll closed by admin.' }));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl bg-white p-5 shadow-sm"
          >
            <div className="mb-3 h-5 w-2/3 rounded bg-slate-200" />
            <div className="space-y-2">
              <div className="h-10 w-full rounded bg-slate-100" />
              <div className="h-10 w-full rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">Failed to load polls.</p>
      </div>
    );
  }

  if (!polls || polls.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">
        <p className="text-[var(--color-text-muted)]">
          No active polls at the moment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          Polls & Surveys
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Participate in community decisions – your vote matters!
        </p>
      </div>

      {polls.map((poll: Poll) => {
        const maxVotes = Math.max(...poll.options.map((o: PollOption) => o.voteCount), 1);
        const isOpen =
          !closedPolls.has(poll.id) &&
          (!poll.closesAt || new Date(poll.closesAt) > new Date());

        return (
          <div
            key={poll.id}
            className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm"
          >
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {poll.question}
              </h2>
              {!isOpen && (
                <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  Closed
                </span>
              )}
              {isOpen && isAdminRole && (
                <button
                  onClick={() => handleClosePoll(poll.id)}
                  className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-600 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400"
                  title="Close this poll"
                >
                  <Lock className="mr-1 inline h-3 w-3" />
                  Close
                </button>
              )}
            </div>

            {/* Options */}
            <div className="space-y-2.5">
              {poll.options.map((option: PollOption) => {
                const isSelected = (selectedOptions[poll.id] ?? []).includes(option.id);
                const hasVoted = votedPolls.has(poll.id);

                return (
                  <button
                    key={option.id}
                    onClick={() => {
                      if (hasVoted || !isOpen) return;
                      setSelectedOptions((prev) => {
                        const current = prev[poll.id] ?? [];
                        if (isSelected) {
                          return { ...prev, [poll.id]: current.filter((id) => id !== option.id) };
                        }
                        return { ...prev, [poll.id]: [...current, option.id] };
                      });
                    }}
                    disabled={hasVoted || !isOpen}
                    className={`group w-full cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                      hasVoted
                        ? 'cursor-default border-slate-100 bg-slate-50'
                        : isSelected
                          ? 'border-cyan-300 bg-cyan-50/50 hover:border-cyan-400'
                          : 'border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/30'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">
                        {isSelected && !hasVoted && (
                          <CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5 text-cyan-500" />
                        )}
                        {option.label}
                      </span>
                      <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
                        {option.voteCount} votes (
                        {poll.totalVotes > 0
                          ? Math.round((option.voteCount / poll.totalVotes) * 100)
                          : 0}
                        %)
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-600 transition-all"
                        style={{
                          width: `${Math.round((option.voteCount / maxVotes) * 100)}%`,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <div className="flex items-center gap-1">
                <Vote className="h-3.5 w-3.5" />
                <span>{poll.totalVotes} total votes</span>
              </div>
              {poll.closesAt && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    Ends{' '}
                    {new Date(poll.closesAt).toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
              <span>
                Created by:{' '}
                <span className="font-medium text-[var(--color-text-secondary)]">
                  {poll.createdBy}
                </span>
              </span>

              {/* Vote button */}
              {isOpen && !votedPolls.has(poll.id) && isAuthenticated && (
                <button
                  onClick={async () => {
                    const selected = selectedOptions[poll.id];
                    if (!selected || selected.length === 0) {
                      setVoteFeedback({ ...voteFeedback, [poll.id]: 'Select at least one option.' });
                      return;
                    }
                    try {
                      await votePoll({
                        pollId: poll.id,
                        optionIds: selected,
                        voterAddress: address || '',
                      }).unwrap();
                      setVotedPolls((prev) => new Set(prev).add(poll.id));
                      setVoteFeedback({ ...voteFeedback, [poll.id]: 'Vote submitted!' });
                      createNotification({
                        type: 'poll_vote',
                        text: `${name ?? 'Someone'} voted on "${poll.question.slice(0, 50)}"`,
                        link: '/polls',
                      });
                    } catch {
                      setVoteFeedback({ ...voteFeedback, [poll.id]: 'Failed to vote.' });
                    }
                  }}
                  disabled={isVoting || !(selectedOptions[poll.id]?.length)}
                  className="ml-auto rounded-lg bg-cyan-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isVoting ? 'Voting...' : 'Submit Vote'}
                </button>
              )}
              {votedPolls.has(poll.id) && (
                <span className="ml-auto text-xs font-medium text-emerald-600">
                  ✓ Voted
                </span>
              )}
            </div>
            {voteFeedback[poll.id] && (
              <p className={`mt-2 text-xs ${votedPolls.has(poll.id) ? 'text-emerald-600' : 'text-amber-600'}`}>
                {voteFeedback[poll.id]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PollsPage;
