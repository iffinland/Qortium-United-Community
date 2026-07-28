// ===== Polls Page – Canonical QDN Polls =====

import { useState, type FormEvent } from 'react';
import { Clock, Vote, Plus, X } from 'lucide-react';
import { useGetPollsQuery, useCreatePollMutation, useSubmitVoteMutation, useClosePollMutation } from '../store/api/pollApi';
import { useAppSelector } from '../store';

const PollsPage = () => {
  const { address, isAuthenticated } = useAppSelector((s) => s.auth);
  const { data: pollData, isLoading } = useGetPollsQuery(address ?? '');
  const [createPoll, { isLoading: isCreating }] = useCreatePollMutation();
  const [submitVote] = useSubmitVoteMutation();
  const [closePoll] = useClosePollMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [expiresAt, setExpiresAt] = useState('');
  const [allowVoteChange, setAllowVoteChange] = useState(true);

  const polls = pollData?.polls ?? [];
  const completeness = pollData?.completeness;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const valid = options.filter((o) => o.trim());
    if (!question.trim() || valid.length < 2) return;
    try {
      await createPoll({
        question: question.trim(),
        description: description.trim() || undefined,
        options: valid.map((label, i) => ({ optionId: `po-${Date.now().toString(36)}-${i}`, label: label.trim() })),
        expiresAt: expiresAt || undefined,
        allowVoteChange,
        ownerName: 'User',
        ownerAddress: address ?? '',
      }).unwrap();
      setQuestion(''); setDescription(''); setOptions(['', '']); setExpiresAt(''); setShowCreate(false);
    } catch { /* handled */ }
  };

  const handleVote = async (pollId: string, optionId: string) => {
    try {
      await submitVote({ pollEntityId: pollId, optionId, ownerName: 'User', ownerAddress: address ?? '' }).unwrap();
    } catch { /* handled */ }
  };

  const handleClose = async (poll: typeof polls[0]) => {
    if (!confirm('Close this poll permanently?')) return;
    try {
      await closePoll({
        pollEntityId: poll.id, question: poll.question, description: poll.description,
        options: poll.options.map(o => ({ optionId: o.optionId, label: o.label })),
        expiresAt: poll.expiresAt ? new Date(poll.expiresAt).getTime() : undefined,
        allowVoteChange: poll.allowVoteChange,
        ownerName: poll.ownerName, ownerAddress: poll.ownerAddress,
      }).unwrap();
    } catch { /* handled */ }
  };

  if (isLoading) {
    return (<div className="space-y-4">{[1,2].map(i => (<div key={i} className="animate-pulse rounded-xl bg-white p-5 shadow-sm"><div className="mb-3 h-5 w-2/3 rounded bg-slate-200" /><div className="space-y-2"><div className="h-10 rounded bg-slate-100" /><div className="h-10 rounded bg-slate-100" /></div></div>))}</div>);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-[var(--color-text-primary)]">Polls & Surveys</h1><p className="text-sm text-[var(--color-text-muted)]">Participate in community decisions</p></div>
        {isAuthenticated && <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"><Plus className="h-4 w-4" /> New Poll</button>}
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold">Create a New Poll</h3>
          <input type="text" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Poll question..." className="mb-2 w-full rounded-lg border p-2.5 text-sm dark:bg-slate-800" required />
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" className="mb-2 w-full rounded-lg border p-2.5 text-sm dark:bg-slate-800" />
          {options.map((opt, i) => (
            <div key={i} className="mb-1 flex gap-2">
              <input type="text" value={opt} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }} placeholder={`Option ${i + 1}`} className="flex-1 rounded-lg border p-2 text-sm dark:bg-slate-800" />
              {options.length > 2 && <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => setOptions([...options, ''])} className="mb-2 text-xs text-cyan-600">+ Add option</button>
          <div className="mb-2 flex gap-2">
            <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="rounded-lg border p-2 text-sm dark:bg-slate-800" placeholder="End date" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={allowVoteChange} onChange={e => setAllowVoteChange(e.target.checked)} /> Allow changes</label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isCreating || !question.trim() || options.filter(o => o.trim()).length < 2} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isCreating ? 'Creating...' : 'Publish Poll'}</button>
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      )}

      {completeness === 'incomplete' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">Some poll resources could not be loaded. Results may be incomplete.</div>}
      {completeness === 'unavailable' && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Polls are currently unavailable.</div>}

      {polls.length === 0 && completeness !== 'unavailable' && (<div className="rounded-xl bg-[var(--color-surface-card)] p-8 text-center shadow-sm"><p className="text-sm text-[var(--color-text-muted)]">No polls yet. Create the first one!</p></div>)}

      {polls.map((poll) => {
        const maxVotes = Math.max(...poll.options.map((o) => o.voteCount), 1);
        const isOpen = !poll.isClosed && (!poll.expiresAt || new Date(poll.expiresAt) > new Date());
        return (
          <div key={poll.id} className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{poll.question}</h2>{poll.description && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{poll.description}</p>}</div>
              {!isOpen && <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-500">{poll.isClosed ? 'Closed' : 'Expired'}</span>}
              {isOpen && poll.isOwner && <button onClick={() => handleClose(poll)} className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-100">Close</button>}
            </div>
            {poll.options.map((option) => (
              <button key={option.optionId} onClick={() => { if (isOpen && isAuthenticated) handleVote(poll.id, option.optionId); }} disabled={!isOpen || !isAuthenticated}
                className={`mb-2 w-full rounded-lg border p-3 text-left transition ${!isOpen ? 'cursor-default border-slate-100 bg-slate-50' : 'cursor-pointer border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/30'}`}>
                <div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-medium">{option.label}</span><span className="text-xs tabular-nums text-[var(--color-text-muted)]">{option.voteCount} vote{option.voteCount !== 1 ? 's' : ''}{option.percentage !== null && ` (${option.percentage}%)`}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-600 transition-all" style={{ width: `${Math.round((option.voteCount / maxVotes) * 100)}%` }} /></div>
              </button>
            ))}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1"><Vote className="h-3.5 w-3.5" /> {poll.totalVotes} total</span>
              {poll.expiresAt && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Ends {new Date(poll.expiresAt).toLocaleDateString('en-US',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}</span>}
              <span>by <span className="font-medium">{poll.ownerName}</span></span>
              {!poll.resultsComplete && <span className="text-amber-600">Results may be incomplete</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PollsPage;
