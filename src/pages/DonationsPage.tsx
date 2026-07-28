// ===== Fund Page – Core-Authoritative Wallet Activity =====
//
// Displays the configured community fund wallet, its Core-reported balance,
// and Core-reported wallet activity with truthful direction classification.
// Funding goal display is deferred to a canonical campaign model (Option A).

import { useState } from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  Coins,
  Clock,
  Download,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useGetFundOverviewQuery } from '../store/api/fundApi';
import { fundConfig } from '../config/fundConfig';
import { buildFundTransactionsCsv } from '../services/fund/fundRuntime';
import type { FundTransaction, FundCompleteness } from '../services/fund/fundRuntime';

const DIRECTION_CONFIG = {
  incoming: { label: 'Incoming transfer', icon: ArrowDownLeft, color: 'text-emerald-600', iconBg: 'text-emerald-400', prefix: '+' },
  outgoing: { label: 'Outgoing transfer', icon: ArrowUpRight, color: 'text-rose-600', iconBg: 'text-rose-400', prefix: '-' },
  self: { label: 'Self-transfer', icon: ArrowUpRight, color: 'text-slate-500', iconBg: 'text-slate-400', prefix: '±' },
  unknown: { label: 'Wallet transaction', icon: ExternalLink, color: 'text-slate-500', iconBg: 'text-slate-400', prefix: '' },
} as const;

const COMPLETENESS_LABELS: Record<FundCompleteness, string> = {
  complete: '',
  incomplete: 'Transaction history may be incomplete.',
  empty: 'No wallet activity found.',
  unavailable: 'Transaction data is currently unavailable.',
};

const DonationsPage = () => {
  const { data, isLoading, error } = useGetFundOverviewQuery();
  const [copied, setCopied] = useState(false);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const handleCopy = async () => {
    if (!data?.walletAddress) return;
    await navigator.clipboard.writeText(data.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCSV = () => {
    if (!data) return;
    const csv = buildFundTransactionsCsv(data.transactions, data.transactionCompleteness);
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quc-fund-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Render: Loading ----
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse rounded-xl bg-slate-200 h-32" />
        <div className="animate-pulse rounded-xl bg-slate-200 h-64" />
      </div>
    );
  }

  // ---- Render: Config error ----
  if (fundConfig.status !== 'valid') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-400" />
        <p className="text-red-700">Fund wallet configuration is invalid.</p>
      </div>
    );
  }

  // ---- Render: Error ----
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-400" />
        <p className="text-red-700">{typeof error === 'string' ? error : 'Failed to load fund data.'}</p>
      </div>
    );
  }

  const fundData = data!;
  const balance = fundData.balance;
  const transactions = fundData.transactions;
  const txCompleteness = fundData.transactionCompleteness;
  const viewState = fundData.viewState;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Community Fund</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Public fund wallet and activity</p>
      </div>

      {/* Balance card */}
      <div className="rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 p-6 text-white shadow-lg">
        <div className="mb-1 flex items-center gap-2">
          <Coins className="h-5 w-5 text-amber-300" />
          <p className="text-sm font-medium uppercase tracking-wider text-cyan-100">Fund Wallet Balance</p>
        </div>
        <p className="text-3xl font-bold tabular-nums">
          {balance.status === 'available'
            ? `${balance.balance!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${balance.asset}`
            : <span className="text-cyan-200 text-xl">Unavailable</span>}
        </p>
        <p className="mt-1 text-xs text-cyan-100/80">
          {balance.status === 'available' && balance.balance === 0
            ? 'Wallet balance is zero.'
            : balance.status === 'unavailable'
            ? 'Balance data is currently unavailable.'
            : 'Current wallet balance reported by Core.'}
        </p>
      </div>

      {/* Wallet address + copy */}
      <div className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--color-text-muted)] mb-0.5">Fund Wallet Address</p>
            <code className="text-sm font-mono text-[var(--color-text-primary)] break-all">{fundData.walletAddress}</code>
          </div>
          <button
            onClick={handleCopy}
            className="shrink-0 rounded-lg border border-slate-200 p-2 text-[var(--color-text-muted)] transition hover:border-cyan-300 hover:text-cyan-600"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Send {fundConfig.assetSymbol} to this address using your wallet.
        </p>
      </div>

      {/* Target info (config only, no progress bar) */}
      {fundConfig.informationalTarget && (
        <div className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-text-muted)]">
            <span className="font-medium">Informational fund target:</span>{' '}
            {fundConfig.informationalTarget.toLocaleString('en-US')} {fundConfig.assetSymbol}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            This is a configured target, not derived from wallet balance.
          </p>
        </div>
      )}

      {/* Transactions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
            <Clock className="h-4 w-4 text-[var(--color-text-muted)]" />
            Wallet Activity
          </h2>
          {viewState.csvAvailable && (
            <button onClick={handleExportCSV} className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:border-cyan-300 hover:text-cyan-600">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          )}
        </div>

        {/* Completeness banner */}
        {txCompleteness === 'incomplete' && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
            <AlertTriangle className="mr-1.5 inline h-4 w-4" />
            {COMPLETENESS_LABELS.incomplete}
          </div>
        )}
        {txCompleteness === 'unavailable' && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            <AlertTriangle className="mr-1.5 inline h-4 w-4" />
            {COMPLETENESS_LABELS.unavailable}
          </div>
        )}

        {transactions.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center shadow-sm">
            <p className="text-[var(--color-text-muted)]">
              {txCompleteness === 'empty' ? COMPLETENESS_LABELS.empty
                : txCompleteness === 'unavailable' ? COMPLETENESS_LABELS.unavailable
                : 'No wallet activity.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx: FundTransaction) => {
              const dc = DIRECTION_CONFIG[tx.direction];
              return (
                <div key={tx.signature} className="rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-sm font-medium text-[var(--color-text-primary)]">
                        {dc.label}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-text-muted)]">
                        <span className="flex items-center gap-1">
                          <ArrowUpRight className={`h-3 w-3 ${dc.iconBg}`} />
                          From: {tx.senderAddress ? formatAddress(tx.senderAddress) : '—'}
                        </span>
                        <span className="flex items-center gap-1">
                          <ArrowDownLeft className="h-3 w-3 text-emerald-400" />
                          To: {tx.recipientAddress ? formatAddress(tx.recipientAddress) : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-base font-bold tabular-nums ${dc.color}`}>
                        {dc.prefix}{tx.amount.toLocaleString('en-US')} {fundConfig.assetSymbol}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">{formatDate(tx.timestamp)}</p>
                    </div>
                  </div>
                  {tx.type && (
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Type: {tx.type} {tx.blockHeight ? `· Block: ${tx.blockHeight}` : ''}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DonationsPage;
