// ===== Donations / Fund Page =====

import { useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  Coins,
  Clock,
  Send,
  CheckCircle2,
  Target,
  Download,
} from 'lucide-react';
import {
  useGetFundBalanceQuery,
  useGetFundTransactionsQuery,
} from '../store/api/qortiumApi';
import { useAppSelector } from '../store';

const FUND_ADDRESS = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
const FUND_GOAL = 25000;

const GoalTracker = ({ balance }: { balance: number }) => {
  const pct = Math.min(Math.round((balance / FUND_GOAL) * 100), 100);
  return (
    <div className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
        <Target className="h-4 w-4 text-rose-500" />
        Funding Goal
      </h3>
      <div className="mb-2 flex items-end justify-between">
        <span className="text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
          {pct}%
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {balance.toLocaleString('en-US')} / {FUND_GOAL.toLocaleString('en-US')} QORT
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-600 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
        {FUND_GOAL - balance > 0
          ? `${(FUND_GOAL - balance).toLocaleString('en-US')} QORT remaining to reach the goal`
          : 'Goal reached! 🎉'}
      </p>
    </div>
  );
};

const DonationsPage = () => {
  const { data: balance, isLoading: balanceLoading, error: balanceError } =
    useGetFundBalanceQuery();
  const { data: transactions = [], isLoading: txsLoading, error: txsError } =
    useGetFundTransactionsQuery();
  const { isAuthenticated, name } = useAppSelector((s) => s.auth);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [donationFeedback, setDonationFeedback] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  const isLoading = balanceLoading || txsLoading;
  const error = balanceError || txsError;

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleExportCSV = () => {
    const header = 'ID,From,To,Amount,Description,Date,TxHash';
    const rows = transactions.map(
      (tx) =>
        `${tx.id},${tx.from},${tx.to},${tx.amount},${tx.description.replace(/,/g, ' ')},${tx.timestamp},${tx.txHash}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quc-donations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          Donation Fund
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Track fund activity and support community projects
        </p>
      </div>

      {/* Balance card */}
      <div className="rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 p-6 text-white shadow-lg">
        <div className="mb-1 flex items-center gap-2">
          <Coins className="h-5 w-5 text-amber-300" />
          <p className="text-sm font-medium uppercase tracking-wider text-cyan-100">
            Fund Balance
          </p>
        </div>
        <p className="text-3xl font-bold tabular-nums">
          {isLoading ? (
            <span className="animate-pulse">...</span>
          ) : (
            `${(balance ?? 0).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} QORT`
          )}
        </p>
        <p className="mt-1 text-sm text-cyan-100">
          For supporting community projects and initiatives
        </p>
      </div>

      {/* Goal Tracker */}
      <GoalTracker balance={balance ?? 0} />

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
          {typeof error === 'string' ? error : 'Failed to load fund data.'}
        </div>
      )}

      {/* Donation Form */}
      {isAuthenticated && (
        <form
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            const amt = parseFloat(amount);
            if (!amt || amt <= 0 || isSending) return;
            setIsSending(true);
            setDonationFeedback(null);

            try {
              // In production: use qdnRequest bridge to send QORT
              // await requestQortium({ action: 'SEND_COIN', ... });
              await new Promise((r) => setTimeout(r, 1500)); // simulate

              setDonationFeedback({
                type: 'success',
                msg: `Successfully donated ${amt.toLocaleString('en-US')} QORT!`,
              });
              setAmount('');
              setDescription('');
            } catch {
              setDonationFeedback({
                type: 'error',
                msg: 'Donation failed. Please try again.',
              });
            } finally {
              setIsSending(false);
            }
          }}
          className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm"
        >
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            <Send className="h-4 w-4 text-cyan-500" />
            Make a Donation
          </h3>

          {donationFeedback && (
            <div
              className={`mb-3 rounded-lg p-3 text-sm ${
                donationFeedback.type === 'success'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                  : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400'
              }`}
            >
              {donationFeedback.type === 'success' && (
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
              )}
              {donationFeedback.msg}
            </div>
          )}

          <div className="mb-3 flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                Amount (QORT)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="flex-[2]">
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                Description (optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this donation for?"
                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--color-text-muted)]">
              Donating as{' '}
              <span className="font-medium text-[var(--color-text-secondary)]">
                {name || 'Unknown'}
              </span>
              {' · '}
              Fund: <code className="text-[10px]">{FUND_ADDRESS.slice(0, 8)}...</code>
            </p>
            <button
              type="submit"
              disabled={
                isSending || !amount || parseFloat(amount) <= 0
              }
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending ? 'Sending...' : 'Donate'}
            </button>
          </div>
        </form>
      )}

      {!isAuthenticated && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-center dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-sm text-[var(--color-text-muted)]">
            Sign in to make a donation.
          </p>
        </div>
      )}

      {/* Transactions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
            <Clock className="h-4 w-4 text-[var(--color-text-muted)]" />
            Transaction History
          </h2>
          {transactions.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:border-cyan-300 hover:text-cyan-600 dark:hover:border-cyan-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center shadow-sm">
            <p className="text-[var(--color-text-muted)]">
              No transactions yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: Description + addresses */}
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-sm font-medium text-[var(--color-text-primary)]">
                      {tx.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-text-muted)]">
                      <span className="flex items-center gap-1">
                        <ArrowUpRight className="h-3 w-3 text-rose-400" />
                          From: {formatAddress(tx.from)}
                        </span>
                        <span className="flex items-center gap-1">
                          <ArrowDownLeft className="h-3 w-3 text-emerald-400" />
                          To: {formatAddress(tx.to)}
                      </span>
                    </div>
                  </div>

                  {/* Right: Amount + date */}
                  <div className="shrink-0 text-right">
                    <p className="text-base font-bold tabular-nums text-emerald-600">
                      +{tx.amount.toLocaleString('et-EE')} QORT
                    </p>
                    <div className="flex items-center justify-end gap-1 text-xs text-[var(--color-text-muted)]">
                      <span>{formatDate(tx.timestamp)}</span>
                      <ExternalLink className="h-3 w-3 cursor-pointer transition hover:text-cyan-500" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DonationsPage;
