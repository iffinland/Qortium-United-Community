// ===== Fund Runtime =====
//
// Core-authoritative global fund wallet activity processing.
// Not QDN — Core transactions are authoritative.
//
// Balance contract:
//   Supported GET_BALANCE response shapes: number | numeric string | { balance: number }
//   Rejected: NaN, Infinity, negative, empty string, unsupported object shapes
//   Semantic meaning: CURRENT CORE-REPORTED WALLET BALANCE
//
// Amount contract:
//   Core reports amount as QORT decimal number. No atomic-unit conversion.
//   Accepted: finite non-negative number. Rejected: negative, NaN, Infinity, string, fee fallback.
//
// Transaction type contract:
//   Supported: direct native payment (single sender, recipient, native amount).
//   Unsupported types → rejected → completeness becomes incomplete.
//
// Malformed record contract:
//   Any record that cannot be safely normalized → incomplete, not empty.
//   Zero raw records → empty.

import type { QdnDiagnostic } from '../qdn/diagnostics';
import { warningDiag } from '../qdn/diagnostics';
import { fundConfig } from '../../config/fundConfig';

// ---- Types ----

export type FundCompleteness = 'complete' | 'incomplete' | 'empty' | 'unavailable';

export interface FundBalanceResult {
  status: 'available' | 'unavailable';
  balance: number | null;
  asset: string;
  diagnostics: QdnDiagnostic[];
}

export interface FundTransaction {
  id: string;
  signature: string;
  senderAddress: string;
  recipientAddress: string;
  amount: number;
  fee?: number;
  timestamp: number;
  blockHeight?: number;
  type?: string;
  direction: 'incoming' | 'outgoing' | 'self' | 'unknown';
}

export interface FundTransactionPage {
  transactions: FundTransaction[];
  completeness: FundCompleteness;
  diagnostics: QdnDiagnostic[];
}

// ---- Bridge Function Types ----

export type FundBalanceFn = (address: string) => Promise<unknown>;
export type FundTransactionsFn = (params: {
  address: string;
  limit: number;
  offset: number;
  reverse: boolean;
}) => Promise<unknown[]>;

// ---- Pagination Config ----

export interface FundPaginationConfig {
  pageSize: number;
  maxPages: number;
  maxTransactions: number;
}

export const DEFAULT_FUND_PAGINATION: FundPaginationConfig = {
  pageSize: 50,
  maxPages: 10,
  maxTransactions: 500,
};

// ---- Balance ----

export async function fetchFundBalance(
  balanceFn: FundBalanceFn,
): Promise<FundBalanceResult> {
  if (fundConfig.status !== 'valid') {
    return {
      status: 'unavailable',
      balance: null,
      asset: fundConfig.assetSymbol,
      diagnostics: [warningDiag('fund-config-invalid', 'Fund wallet configuration is invalid or missing')],
    };
  }

  try {
    const raw = await balanceFn(fundConfig.walletAddress);
    const parsed = parseBalance(raw);
    if (parsed !== null) {
      return { status: 'available', balance: parsed, asset: fundConfig.assetSymbol, diagnostics: [] };
    }
    return { status: 'unavailable', balance: null, asset: fundConfig.assetSymbol, diagnostics: [warningDiag('fund-balance-unavailable', 'Could not parse Core balance response')] };
  } catch {
    return { status: 'unavailable', balance: null, asset: fundConfig.assetSymbol, diagnostics: [warningDiag('fund-balance-unavailable', 'Core balance request failed')] };
  }
}

export function parseBalance(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const p = Number(raw);
    if (Number.isFinite(p) && p >= 0) return p;
    return null;
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.balance === 'number' && Number.isFinite(obj.balance) && obj.balance >= 0) {
      return obj.balance;
    }
  }
  return null;
}

// ---- Supported Transaction Types ----

const NORMALIZED_PAYMENT = 'PAYMENT';
const SUPPORTED_TX_TYPES = new Set<string>([NORMALIZED_PAYMENT]);

export function isSupportedFundTransactionType(type: unknown): { supported: boolean; normalizedType?: string; reason?: string } {
  if (type === undefined || type === null) return { supported: false, reason: 'missing' };
  if (typeof type !== 'string') return { supported: false, reason: 'invalid-type' };
  const trimmed = type.trim();
  if (trimmed === '') return { supported: false, reason: 'empty' };
  const upper = trimmed.toUpperCase();
  if (SUPPORTED_TX_TYPES.has(upper)) return { supported: true, normalizedType: NORMALIZED_PAYMENT };
  return { supported: false, reason: `unsupported:${trimmed}` };
}

// ---- Transaction Fetch (Paginated) ----

export async function fetchFundTransactions(
  txFn: FundTransactionsFn,
  config: FundPaginationConfig = DEFAULT_FUND_PAGINATION,
): Promise<FundTransactionPage> {
  if (fundConfig.status !== 'valid') {
    return { transactions: [], completeness: 'unavailable', diagnostics: [warningDiag('fund-config-invalid', 'Fund wallet configuration is invalid')] };
  }

  const allTransactions: FundTransaction[] = [];
  const seenSignatures = new Set<string>();
  const diagnostics: QdnDiagnostic[] = [];
  let previousFingerprint = '';
  let offset = 0;
  let naturallyTerminated = false;

  try {
    for (let page = 0; page < config.maxPages; page++) {
      // Safety: check total
      if (allTransactions.length >= config.maxTransactions) {
        diagnostics.push(warningDiag('fund-pagination-safety-limit', `Reached max transaction limit (${config.maxTransactions})`, { identifier: 'max-transactions' }));
        return { transactions: sortFundTransactions(allTransactions), completeness: 'incomplete', diagnostics: sortFundDiagnostics(diagnostics) };
      }

      let rawPage: unknown[];
      try {
        rawPage = await txFn({
          address: fundConfig.walletAddress,
          limit: config.pageSize,
          offset,
          reverse: true,
        });
      } catch {
        if (page === 0) {
          return { transactions: [], completeness: 'unavailable', diagnostics: [warningDiag('fund-transaction-search-unavailable', 'Core transaction search failed')] };
        }
        diagnostics.push(warningDiag('fund-transaction-page-failed', `Transaction page ${page} fetch failed`));
        return { transactions: sortFundTransactions(allTransactions), completeness: 'incomplete', diagnostics };
      }

      if (!Array.isArray(rawPage)) {
        if (page === 0) return { transactions: [], completeness: 'unavailable', diagnostics: [warningDiag('fund-transaction-search-unavailable', 'Invalid Core transaction response')] };
        return { transactions: sortFundTransactions(allTransactions), completeness: 'incomplete', diagnostics };
      }

      // Repeated page detection
      const fingerprint = JSON.stringify(rawPage);
      if (fingerprint === previousFingerprint && rawPage.length > 0) {
        diagnostics.push(warningDiag('fund-pagination-repeated-page', `Repeated page detected at offset ${offset}`));
        return { transactions: sortFundTransactions(allTransactions), completeness: 'incomplete', diagnostics };
      }
      previousFingerprint = fingerprint;

      // Normalize and deduplicate
      for (const raw of rawPage) {
        const result = normalizeTransactionWithDiagnostic(raw);
        if (!result.tx) {
          diagnostics.push(warningDiag(result.diagnosticCode ?? 'fund-transaction-malformed', 'Skipped malformed or unsupported transaction record'));
          continue;
        }
        if (seenSignatures.has(result.tx.signature)) continue;
        seenSignatures.add(result.tx.signature);
        allTransactions.push(result.tx);
      }

      offset += config.pageSize;

      // Termination: fewer than page size returned
      if (rawPage.length < config.pageSize) {
        naturallyTerminated = true;
        break;
      }
    }

    // Check if maxPages exhausted without natural termination
    if (!naturallyTerminated && allTransactions.length > 0 && diagnostics.every(d => d.code !== 'fund-pagination-safety-limit')) {
      diagnostics.push(warningDiag('fund-pagination-safety-limit', `Reached max pages limit (${config.maxPages})`, { identifier: 'max-pages' }));
    }

    // Completeness: any malformed/unsupported record or diagnostic → incomplete
    const hasIssues = diagnostics.length > 0;
    const completeness: FundCompleteness = allTransactions.length === 0 && !hasIssues ? 'empty'
      : hasIssues ? 'incomplete'
      : 'complete';

    return {
      transactions: sortFundTransactions(allTransactions),
      completeness,
      diagnostics: sortFundDiagnostics(diagnostics),
    };
  } catch {
    return { transactions: [], completeness: 'unavailable', diagnostics: [warningDiag('fund-transaction-search-unavailable', 'Core transaction search failed unexpectedly')] };
  }
}

// ---- Transaction Normalization ----

export interface NormalizeResult {
  tx: FundTransaction | null;
  diagnosticCode?: string;
}

export function normalizeTransaction(raw: unknown): FundTransaction | null {
  const result = normalizeTransactionWithDiagnostic(raw);
  return result.tx;
}

export function normalizeTransactionWithDiagnostic(raw: unknown): NormalizeResult {
  if (!raw || typeof raw !== 'object') return { tx: null, diagnosticCode: 'fund-transaction-malformed' };
  const tx = raw as Record<string, unknown>;

  // 1. Transaction type (highest precedence)
  const txType = tx.txType ?? tx.type;
  const typeResult = isSupportedFundTransactionType(txType);
  if (!typeResult.supported) {
    return { tx: null, diagnosticCode: 'fund-transaction-type-unsupported' };
  }
  const normalizedType = typeResult.normalizedType;

  // 2. Signature (authoritative identity)
  const signature = typeof tx.signature === 'string' && tx.signature.trim() !== ''
    ? tx.signature.trim()
    : null;
  if (!signature) {
    return { tx: null, diagnosticCode: 'fund-transaction-id-missing' };
  }

  // 3. Amount
  const amount = typeof tx.amount === 'number' && Number.isFinite(tx.amount) && tx.amount >= 0
    ? tx.amount : null;
  if (amount === null) {
    return { tx: null, diagnosticCode: 'fund-transaction-amount-invalid' };
  }

  // 4. Timestamp
  const timestamp = typeof tx.timestamp === 'number' && tx.timestamp > 0
    ? tx.timestamp : null;
  if (timestamp === null) {
    return { tx: null, diagnosticCode: 'fund-transaction-timestamp-invalid' };
  }

  // 5. Address fields (malformed → reject; missing → accept with unknown direction)
  const senderRaw = tx.creatorAddress ?? tx.sender;
  const senderResult = validateFundTransactionAddressField(senderRaw);
  if (senderResult.status === 'invalid') {
    return { tx: null, diagnosticCode: 'fund-transaction-address-invalid' };
  }
  const recipientRaw = tx.recipient ?? tx.to;
  const recipientResult = validateFundTransactionAddressField(recipientRaw);
  if (recipientResult.status === 'invalid') {
    return { tx: null, diagnosticCode: 'fund-transaction-address-invalid' };
  }
  const sender = senderResult.status === 'valid' ? senderResult.value : '';
  const recipient = recipientResult.status === 'valid' ? recipientResult.value : '';

  return {
    tx: {
      id: signature,
      signature,
      senderAddress: sender,
      recipientAddress: recipient,
      amount,
      fee: typeof tx.fee === 'number' ? tx.fee : undefined,
      timestamp,
      blockHeight: typeof tx.blockHeight === 'number' ? tx.blockHeight : undefined,
      type: normalizedType,
      direction: classifyFundTransactionDirection(sender, recipient, fundConfig.walletAddress),
    },
  };
}

// ---- Address Field Validation ----

export type AddressFieldResult =
  | { status: 'missing' }
  | { status: 'valid'; value: string }
  | { status: 'invalid'; reason: string };

export function validateFundTransactionAddressField(raw: unknown): AddressFieldResult {
  if (raw === undefined || raw === null) return { status: 'missing' };
  if (typeof raw !== 'string') return { status: 'invalid', reason: `Expected string, got ${typeof raw}` };
  const trimmed = raw.trim();
  if (trimmed === '') return { status: 'invalid', reason: 'Empty or whitespace-only address' };
  return { status: 'valid', value: trimmed };
}

// ---- Direction Classification ----

export function classifyFundTransactionDirection(
  sender: string,
  recipient: string,
  fundAddress: string,
): FundTransaction['direction'] {
  if (!sender || !recipient) return 'unknown';
  const isSender = sender === fundAddress;
  const isRecipient = recipient === fundAddress;
  if (isSender && isRecipient) return 'self';
  if (isRecipient) return 'incoming';
  if (isSender) return 'outgoing';
  return 'unknown';
}

// ---- Sorting ----

export function sortFundTransactions(txs: FundTransaction[]): FundTransaction[] {
  return [...txs].sort((a, b) => {
    const tsCmp = (b.timestamp ?? 0) - (a.timestamp ?? 0);
    if (tsCmp !== 0) return tsCmp;
    const bhCmp = (b.blockHeight ?? 0) - (a.blockHeight ?? 0);
    if (bhCmp !== 0) return bhCmp;
    return a.signature.localeCompare(b.signature);
  });
}

// ---- Diagnostic Sorter ----

export function sortFundDiagnostics(diags: QdnDiagnostic[]): QdnDiagnostic[] {
  return [...diags].sort((a, b) => {
    const codeCmp = (a.code ?? '').localeCompare(b.code ?? '');
    if (codeCmp !== 0) return codeCmp;
    const recA = a as unknown as Record<string, unknown>;
    const recB = b as unknown as Record<string, unknown>;
    const pageCmp = ((recA.page as number) ?? 0) - ((recB.page as number) ?? 0);
    if (pageCmp !== 0) return pageCmp;
    const sigCmp = ((recA.signature as string) ?? '').localeCompare((recB.signature as string) ?? '');
    if (sigCmp !== 0) return sigCmp;
    const fieldCmp = ((recA.field as string) ?? '').localeCompare((recB.field as string) ?? '');
    if (fieldCmp !== 0) return fieldCmp;
    return (a.message ?? '').localeCompare(b.message ?? '');
  });
}

// ---- Donations View-State Helper ----

export type BalanceViewState = 'available-positive' | 'available-zero' | 'unavailable';
export type TransactionsViewState = 'complete' | 'incomplete' | 'empty' | 'unavailable';

export interface DonationsViewState {
  balanceView: BalanceViewState;
  transactionsView: TransactionsViewState;
  configValid: boolean;
  csvAvailable: boolean;
  csvIncomplete: boolean;
}

export function deriveDonationsViewState(
  balance: FundBalanceResult,
  txPage: FundTransactionPage,
  configStatus: string,
): DonationsViewState {
  const configValid = configStatus === 'valid';
  const balanceView: BalanceViewState = !configValid || balance.status === 'unavailable' ? 'unavailable'
    : balance.balance === 0 ? 'available-zero'
    : 'available-positive';

  const txCompleteness = txPage.completeness;
  const transactionsView: TransactionsViewState = txCompleteness;

  const csvAvailable = txPage.transactions.length > 0 && txPage.completeness !== 'unavailable';
  const csvIncomplete = txPage.completeness === 'incomplete';

  return { balanceView, transactionsView, configValid, csvAvailable, csvIncomplete };
}

// ---- Fund Overview Helper ----

export interface FundOverview {
  balance: FundBalanceResult;
  transactions: FundTransaction[];
  transactionCompleteness: FundCompleteness;
  walletAddress: string;
  configStatus: string;
  viewState: DonationsViewState;
}

export function composeFundOverview(
  balance: FundBalanceResult,
  txPage: FundTransactionPage,
): FundOverview {
  return {
    balance,
    transactions: txPage.transactions,
    transactionCompleteness: txPage.completeness,
    walletAddress: fundConfig.walletAddress,
    configStatus: fundConfig.status,
    viewState: deriveDonationsViewState(balance, txPage, fundConfig.status),
  };
}

// ---- CSV Builder ----

export function buildFundTransactionsCsv(transactions: FundTransaction[], completeness: FundCompleteness): string | null {
  if (completeness === 'unavailable' || transactions.length === 0) return null;

  const header = 'Signature,Timestamp,Direction,Sender,Recipient,Amount,Type';
  const rows = transactions.map((tx) =>
    `${tx.signature},${new Date(tx.timestamp).toISOString()},${tx.direction},${tx.senderAddress},${tx.recipientAddress},${tx.amount},${tx.type ?? ''}`
  );

  if (completeness === 'incomplete') {
    return `Data completeness,INCOMPLETE\n${header}\n${rows.join('\n')}`;
  }

  return `${header}\n${rows.join('\n')}`;
}
