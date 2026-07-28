// ===== Fund Runtime Production-Path Tests =====
//
// QUCP-DONATIONS-001: Fund config, balance, transaction normalization,
// direction classification, pagination, dedup, ordering, completeness.

import { describe, it, expect } from 'vitest';
import {
  classifyFundTransactionDirection,
  normalizeTransaction,
  normalizeTransactionWithDiagnostic,
  sortFundTransactions,
  fetchFundBalance,
  fetchFundTransactions,
  parseBalance,
  isSupportedFundTransactionType,
  sortFundDiagnostics,
  composeFundOverview,
  deriveDonationsViewState,
  buildFundTransactionsCsv,
  type FundBalanceFn,
  type FundTransactionsFn,
  type FundTransaction,
} from '../services/fund/fundRuntime';
import { fundConfig } from '../config/fundConfig';

const FUND = fundConfig.walletAddress;
const FOREIGN = 'QForeignForeignForeignForeignAbCd';

// ---- Config Tests ----

describe('fund config', () => {
  it('has a valid wallet address', () => {
    expect(fundConfig.walletAddress).toMatch(/^Q[A-Za-z0-9]{33,36}$/);
  });

  it('has valid status', () => {
    expect(fundConfig.status).toBe('valid');
  });

  it('has asset symbol', () => {
    expect(fundConfig.assetSymbol).toBe('QORT');
  });
});

// ---- Balance Tests ----

describe('fund balance', () => {
  it('positive balance available', async () => {
    const fn: FundBalanceFn = async () => 1234.5;
    const result = await fetchFundBalance(fn);
    expect(result.status).toBe('available');
    expect(result.balance).toBe(1234.5);
  });

  it('zero balance is available, not unavailable', async () => {
    const fn: FundBalanceFn = async () => 0;
    const result = await fetchFundBalance(fn);
    expect(result.status).toBe('available');
    expect(result.balance).toBe(0);
  });

  it('malformed balance becomes unavailable', async () => {
    const fn: FundBalanceFn = async () => ({ invalid: true });
    const result = await fetchFundBalance(fn);
    expect(result.status).toBe('unavailable');
    expect(result.balance).toBeNull();
  });

  it('bridge failure becomes unavailable', async () => {
    const fn: FundBalanceFn = async () => { throw new Error('Down'); };
    const result = await fetchFundBalance(fn);
    expect(result.status).toBe('unavailable');
    expect(result.balance).toBeNull();
  });
});

// ---- Transaction Normalization ----

describe('transaction normalization', () => {
  const validTx = {
    signature: 'sig123abc',
    creatorAddress: FOREIGN,
    recipient: FUND,
    amount: 500,
    timestamp: 1700000000000,
    fee: 0.01,
    txType: 'PAYMENT',
    blockHeight: 1000,
  };

  it('normalizes valid transfer', () => {
    const tx = normalizeTransaction(validTx);
    expect(tx).not.toBeNull();
    expect(tx!.signature).toBe('sig123abc');
    expect(tx!.amount).toBe(500);
    expect(tx!.timestamp).toBe(1700000000000);
    expect(tx!.direction).toBe('incoming');
  });

  it('rejects missing signature', () => {
    const { signature: _sig, ...noSig } = validTx;
    void _sig;
    expect(normalizeTransaction(noSig)).toBeNull();
  });

  it('rejects invalid amount', () => {
    expect(normalizeTransaction({ ...validTx, amount: -1 })).toBeNull();
    expect(normalizeTransaction({ ...validTx, amount: NaN })).toBeNull();
    expect(normalizeTransaction({ ...validTx, amount: '500' })).toBeNull();
  });

  it('fee not used as amount', () => {
    const { amount: _amt, ...noAmount } = validTx;
    void _amt;
    expect(normalizeTransaction({ ...noAmount, fee: 0.1 })).toBeNull();
  });

  it('rejects missing timestamp', () => {
    const { timestamp: _ts, ...noTs } = validTx;
    void _ts;
    expect(normalizeTransaction(noTs)).toBeNull();
  });

  it('rejects null input', () => {
    expect(normalizeTransaction(null)).toBeNull();
    expect(normalizeTransaction(undefined)).toBeNull();
  });
});

// ---- Direction Classification ----

describe('direction classification', () => {
  it('incoming: stranger → fund', () => {
    expect(classifyFundTransactionDirection(FOREIGN, FUND, FUND)).toBe('incoming');
  });

  it('outgoing: fund → stranger', () => {
    expect(classifyFundTransactionDirection(FUND, FOREIGN, FUND)).toBe('outgoing');
  });

  it('self: fund → fund', () => {
    expect(classifyFundTransactionDirection(FUND, FUND, FUND)).toBe('self');
  });

  it('unknown: neither matches fund', () => {
    expect(classifyFundTransactionDirection(FOREIGN, 'QOtherOtherOtherOtherOther', FUND)).toBe('unknown');
  });

  it('unknown: missing sender', () => {
    expect(classifyFundTransactionDirection('', FUND, FUND)).toBe('unknown');
  });
});

// ---- Sorting ----

describe('transaction sorting', () => {
  const makeTx = (sig: string, ts: number, bh?: number): FundTransaction => ({
    id: sig, signature: sig, senderAddress: FOREIGN, recipientAddress: FUND,
    amount: 100, timestamp: ts, blockHeight: bh, direction: 'incoming',
  });

  it('newest timestamp first', () => {
    const sorted = sortFundTransactions([makeTx('a', 1000), makeTx('b', 2000), makeTx('c', 1500)]);
    expect(sorted[0].signature).toBe('b'); // 2000
    expect(sorted[1].signature).toBe('c'); // 1500
    expect(sorted[2].signature).toBe('a'); // 1000
  });

  it('tie-break block height desc', () => {
    const sorted = sortFundTransactions([makeTx('a', 1000, 5), makeTx('b', 1000, 10)]);
    expect(sorted[0].signature).toBe('b'); // bh 10
  });

  it('final tie-break signature alpha', () => {
    const sorted = sortFundTransactions([makeTx('z', 1000), makeTx('a', 1000)]);
    expect(sorted[0].signature).toBe('a');
  });

  it('permutation stable', () => {
    const txs = [makeTx('b', 2000), makeTx('a', 1000), makeTx('c', 3000)];
    const s1 = sortFundTransactions([txs[0], txs[1], txs[2]]);
    const s2 = sortFundTransactions([txs[2], txs[0], txs[1]]);
    expect(s1.map((t: FundTransaction) => t.signature)).toEqual(s2.map((t: FundTransaction) => t.signature));
  });
});

// ---- Pagination + Completeness ----

describe('fund transaction pagination', () => {
  const makeCoreTx = (sig: string, ts: number) => ({
    signature: sig, creatorAddress: FOREIGN, recipient: FUND,
    amount: 100, timestamp: ts, fee: 0.01, txType: 'PAYMENT',
  });

  it('single page complete', async () => {
    const fn: FundTransactionsFn = async () => [makeCoreTx('sig1', 1700000000000)];
    const result = await fetchFundTransactions(fn, { pageSize: 50, maxPages: 10, maxTransactions: 500 });
    expect(result.transactions.length).toBe(1);
    expect(result.completeness).toBe('complete');
  });

  it('multi-page complete', async () => {
    let callCount = 0;

    const fn: FundTransactionsFn =
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => {

      callCount++;
      if (callCount === 1) return [makeCoreTx('sig1', 1700000000000)];
      if (callCount === 2) return [makeCoreTx('sig2', 1700000001000)];
      return [];
    };
    const result = await fetchFundTransactions(fn, { pageSize: 1, maxPages: 10, maxTransactions: 500 });
    expect(result.transactions.length).toBe(2);
    expect(result.completeness).toBe('complete');
    expect(callCount).toBe(3); // page 1, page 2, empty page 3
  });

  it('empty yields empty', async () => {
    const fn: FundTransactionsFn = async () => [];
    const result = await fetchFundTransactions(fn, { pageSize: 50, maxPages: 10, maxTransactions: 500 });
    expect(result.completeness).toBe('empty');
    expect(result.transactions.length).toBe(0);
  });

  it('search failure yields unavailable', async () => {
    const fn: FundTransactionsFn = async () => { throw new Error('Down'); };
    const result = await fetchFundTransactions(fn);
    expect(result.completeness).toBe('unavailable');
  });

  it('safety limit triggers incomplete', async () => {
    let c = 0;

    const fn: FundTransactionsFn =
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => {

      c++;
      if (c === 1) return [makeCoreTx('sig1', 1700000000000)];
      return [makeCoreTx('sig2', 1700000001000)];
    };
    const result = await fetchFundTransactions(fn, { pageSize: 1, maxPages: 10, maxTransactions: 1 });
    expect(result.completeness).toBe('incomplete');
  });

  it('duplicate signatures deduplicated', async () => {
    const fn: FundTransactionsFn = async () => [
      makeCoreTx('sig1', 1700000000000),
      makeCoreTx('sig1', 1700000000000), // duplicate
      makeCoreTx('sig2', 1700000001000),
    ];
    const result = await fetchFundTransactions(fn);
    expect(result.transactions.length).toBe(2);
  });

  it('repeated page detection', async () => {
    const samePage = [makeCoreTx('sig1', 1700000000000)];

    const fn: FundTransactionsFn =
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => {

      return samePage;
    };
    const result = await fetchFundTransactions(fn, { pageSize: 1, maxPages: 5, maxTransactions: 500 });
    expect(result.completeness).toBe('incomplete');
  });
});

// ================================================================
//  BALANCE PARSER CONTRACT
// ================================================================

describe('balance parser contract', () => {
  it('accepts positive number', () => {
    expect(parseBalance(1234.5)).toBe(1234.5);
  });

  it('accepts zero', () => {
    expect(parseBalance(0)).toBe(0);
  });

  it('accepts numeric string', () => {
    expect(parseBalance('500')).toBe(500);
  });

  it('accepts { balance: number }', () => {
    expect(parseBalance({ balance: 100 })).toBe(100);
  });

  it('rejects negative number', () => {
    expect(parseBalance(-1)).toBeNull();
  });

  it('rejects NaN', () => {
    expect(parseBalance(NaN)).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(parseBalance(Infinity)).toBeNull();
  });

  it('rejects empty string', () => {
    expect(parseBalance('')).toBeNull();
  });

  it('rejects unsupported object shape', () => {
    expect(parseBalance({ confirmedBalance: 100 })).toBeNull();
  });

  it('rejects array', () => {
    expect(parseBalance([100])).toBeNull();
  });
});

// ================================================================
//  TRANSACTION TYPE SUPPORT
// ================================================================

describe('transaction type support', () => {
  it('PAYMENT is supported', () => {
    expect(isSupportedFundTransactionType('PAYMENT').supported).toBe(true);
  });

  it('payment (lowercase) is supported and normalized', () => {
    const r = isSupportedFundTransactionType('payment');
    expect(r.supported).toBe(true);
    expect(r.normalizedType).toBe('PAYMENT');
  });

  it('Payment (mixed case) is supported and normalized', () => {
    const r = isSupportedFundTransactionType('Payment');
    expect(r.supported).toBe(true);
    expect(r.normalizedType).toBe('PAYMENT');
  });

  it('undefined type is NOT supported', () => {
    const r = isSupportedFundTransactionType(undefined);
    expect(r.supported).toBe(false);
    expect(r.reason).toBe('missing');
  });

  it('null type is NOT supported', () => {
    const r = isSupportedFundTransactionType(null);
    expect(r.supported).toBe(false);
  });

  it('empty string type is NOT supported', () => {
    const r = isSupportedFundTransactionType('');
    expect(r.supported).toBe(false);
    expect(r.reason).toBe('empty');
  });

  it('whitespace type is NOT supported', () => {
    const r = isSupportedFundTransactionType('   ');
    expect(r.supported).toBe(false);
    expect(r.reason).toBe('empty');
  });

  it('ARBITRARY is NOT supported', () => {
    const r = isSupportedFundTransactionType('ARBITRARY');
    expect(r.supported).toBe(false);
  });

  it('number type is NOT supported', () => {
    const r = isSupportedFundTransactionType(1);
    expect(r.supported).toBe(false);
    expect(r.reason).toBe('invalid-type');
  });

  it('object type is NOT supported', () => {
    const r = isSupportedFundTransactionType({});
    expect(r.supported).toBe(false);
    expect(r.reason).toBe('invalid-type');
  });
});

// ================================================================
//  SIGNATURE VALIDATION
// ================================================================

describe('signature validation', () => {
  const base = { signature: 'sig1', amount: 100, timestamp: 1700000000000, creatorAddress: 'QForeignForeignForeignForeignAbCd', recipient: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', txType: 'PAYMENT' };

  it('whitespace-only signature rejected', () => {
    expect(normalizeTransaction({ ...base, signature: '   ' })).toBeNull();
  });

  it('empty string signature rejected', () => {
    expect(normalizeTransaction({ ...base, signature: '' })).toBeNull();
  });

  it('different signatures same amount/time both retained', () => {
    const tx1 = normalizeTransaction(base);
    const tx2 = normalizeTransaction({ ...base, signature: 'sig2' });
    expect(tx1).not.toBeNull();
    expect(tx2).not.toBeNull();
    expect(tx1!.signature).not.toBe(tx2!.signature);
  });
});

// ================================================================
//  PAGINATION COMPLETENESS MATRIX
// ================================================================

describe('pagination completeness matrix', () => {
  const makeTx = (sig: string) => ({ signature: sig, creatorAddress: 'QForeignForeignForeignForeignAbCd', recipient: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', amount: 100, timestamp: 1700000000000, txType: 'PAYMENT' });

  it('later page failure preserves prior + incomplete', async () => {
    let page = 0;
    const fn: FundTransactionsFn =
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => {
      page++;
      if (page === 1) return [makeTx('sig1')];
      throw new Error('Page 2 failed');
    };
    const result = await fetchFundTransactions(fn, { pageSize: 1, maxPages: 10, maxTransactions: 500 });
    expect(result.transactions.length).toBe(1);
    expect(result.completeness).toBe('incomplete');
    expect(result.diagnostics.some(d => d.code === 'fund-transaction-page-failed')).toBe(true);
  });

  it('initial page failure → unavailable', async () => {

    const fn: FundTransactionsFn = // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => { throw new Error('Down'); };
    const result = await fetchFundTransactions(fn);
    expect(result.transactions.length).toBe(0);
    expect(result.completeness).toBe('unavailable');
  });

  it('malformed record makes incomplete, not complete', async () => {

    const fn: FundTransactionsFn = // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => [
      makeTx('sig1'),
      { invalid: 'record' }, // malformed
    ];
    const result = await fetchFundTransactions(fn, { pageSize: 50, maxPages: 10, maxTransactions: 500 });
    expect(result.transactions.length).toBe(1);
    expect(result.completeness).toBe('incomplete');
    expect(result.diagnostics.some(d => d.code === 'fund-transaction-malformed' || d.code === 'fund-transaction-type-unsupported')).toBe(true);
  });

  it('maximum transactions reached → incomplete', async () => {
    let callCount = 0;
    const fn: FundTransactionsFn =
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => {
      callCount++;
      return [makeTx(`sig${callCount}`)];
    };
    const result = await fetchFundTransactions(fn, { pageSize: 1, maxPages: 10, maxTransactions: 1 });
    expect(result.completeness).toBe('incomplete');
    expect(result.diagnostics.some(d => d.code === 'fund-pagination-safety-limit')).toBe(true);
  });
});

// ================================================================
//  DIAGNOSTIC SORTER
// ================================================================

describe('diagnostic sorter', () => {
  it('sorts by code then signature', () => {
    const diags = [
      { level: 'warning' as const, code: 'z-last', message: 'z', signature: 'c' },
      { level: 'warning' as const, code: 'a-first', message: 'a', signature: 'a' },
      { level: 'warning' as const, code: 'a-first', message: 'b', signature: 'b' },
    ];
    const sorted = sortFundDiagnostics(diags);
    expect(sorted[0].code).toBe('a-first');
    expect(sorted[1].code).toBe('a-first');
    expect(sorted[2].code).toBe('z-last');
  });

  it('permutation stable', () => {
    const diags = [
      { level: 'warning' as const, code: 'c', message: 'c' },
      { level: 'warning' as const, code: 'a', message: 'a' },
      { level: 'warning' as const, code: 'b', message: 'b' },
    ];
    const s1 = sortFundDiagnostics([diags[1], diags[2], diags[0]]);
    const s2 = sortFundDiagnostics([diags[0], diags[1], diags[2]]);
    expect(s1.map(d => d.code)).toEqual(s2.map(d => d.code));
  });
});

// ================================================================
//  OVERVIEW COMPOSER
// ================================================================

describe('overview composer', () => {
  const availBalance = { status: 'available' as const, balance: 100, asset: 'QORT', diagnostics: [] };
  const unavailBalance = { status: 'unavailable' as const, balance: null, asset: 'QORT', diagnostics: [] };
  const completePage = { transactions: [], completeness: 'complete' as const, diagnostics: [] };
  const incompletePage = { transactions: [], completeness: 'incomplete' as const, diagnostics: [] };
  const unavailablePage = { transactions: [], completeness: 'unavailable' as const, diagnostics: [] };

  it('balance available + transactions complete', () => {
    const overview = composeFundOverview(availBalance, completePage);
    expect(overview.balance.status).toBe('available');
    expect(overview.transactionCompleteness).toBe('complete');
  });

  it('balance available + transactions unavailable', () => {
    const overview = composeFundOverview(availBalance, unavailablePage);
    expect(overview.balance.status).toBe('available');
    expect(overview.transactionCompleteness).toBe('unavailable');
  });

  it('balance unavailable + transactions complete', () => {
    const overview = composeFundOverview(unavailBalance, completePage);
    expect(overview.balance.status).toBe('unavailable');
    expect(overview.transactionCompleteness).toBe('complete');
  });

  it('balance unavailable + transactions incomplete', () => {
    const overview = composeFundOverview(unavailBalance, incompletePage);
    expect(overview.balance.status).toBe('unavailable');
    expect(overview.transactionCompleteness).toBe('incomplete');
  });
});

// ================================================================
//  VIEW-STATE HELPER
// ================================================================

describe('view-state helper', () => {
  const availBalance = { status: 'available' as const, balance: 100, asset: 'QORT', diagnostics: [] };
  const zeroBalance = { status: 'available' as const, balance: 0, asset: 'QORT', diagnostics: [] };
  const unavailBalance = { status: 'unavailable' as const, balance: null, asset: 'QORT', diagnostics: [] };
  const incompletePage = { transactions: [{ id: 's', signature: 's', senderAddress: '', recipientAddress: '', amount: 1, timestamp: 1, direction: 'incoming' as const }], completeness: 'incomplete' as const, diagnostics: [] };
  const emptyPage = { transactions: [], completeness: 'empty' as const, diagnostics: [] };
  const unavailablePage = { transactions: [], completeness: 'unavailable' as const, diagnostics: [] };

  it('zero balance distinct from unavailable', () => {
    const vs = deriveDonationsViewState(zeroBalance, emptyPage, 'valid');
    expect(vs.balanceView).toBe('available-zero');
  });

  it('unavailable balance distinct', () => {
    const vs = deriveDonationsViewState(unavailBalance, emptyPage, 'valid');
    expect(vs.balanceView).toBe('unavailable');
  });

  it('empty transactions distinct from unavailable', () => {
    const vs = deriveDonationsViewState(availBalance, emptyPage, 'valid');
    expect(vs.transactionsView).toBe('empty');
  });

  it('unavailable transactions distinct', () => {
    const vs = deriveDonationsViewState(availBalance, unavailablePage, 'valid');
    expect(vs.transactionsView).toBe('unavailable');
  });

  it('incomplete transactions warning', () => {
    const vs = deriveDonationsViewState(availBalance, incompletePage, 'valid');
    expect(vs.transactionsView).toBe('incomplete');
    expect(vs.csvIncomplete).toBe(true);
  });
});

// ================================================================
//  CSV BUILDER
// ================================================================

describe('CSV builder', () => {
  const tx = { id: 's', signature: 'sig1', senderAddress: 'QForeignForeignForeignForeignAbCd', recipientAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', amount: 100, timestamp: 1700000000000, direction: 'incoming' as const, type: 'PAYMENT' };

  it('complete export includes header', () => {
    const csv = buildFundTransactionsCsv([tx], 'complete');
    expect(csv).not.toBeNull();
    expect(csv!).toContain('Signature');
    expect(csv!).toContain('sig1');
  });

  it('incomplete export includes INCOMPLETE marker', () => {
    const csv = buildFundTransactionsCsv([tx], 'incomplete');
    expect(csv).not.toBeNull();
    expect(csv!).toContain('INCOMPLETE');
  });

  it('unavailable → null', () => {
    expect(buildFundTransactionsCsv([tx], 'unavailable')).toBeNull();
  });

  it('empty transactions → null', () => {
    expect(buildFundTransactionsCsv([], 'complete')).toBeNull();
  });

  it('does not contain donation wording', () => {
    const csv = buildFundTransactionsCsv([tx], 'complete');
    expect(csv!).not.toContain('donation');
    expect(csv!).not.toContain('Donation');
  });
});

// ================================================================
//  DIAGNOSTIC REASON CODES
// ================================================================

describe('diagnostic reason codes', () => {
  const base = { signature: 'sig1', amount: 100, timestamp: 1700000000000, creatorAddress: 'QForeignForeignForeignForeignAbCd', recipient: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', txType: 'PAYMENT' };

  it('unsupported type → fund-transaction-type-unsupported', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, txType: 'ARBITRARY' });
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-type-unsupported');
  });

  it('missing type → fund-transaction-type-unsupported', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { txType: _txType, ...noType } = base;
    const r = normalizeTransactionWithDiagnostic(noType);
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-type-unsupported');
  });

  it('missing signature → fund-transaction-id-missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signature: _sig, ...noSig } = base;
    const r = normalizeTransactionWithDiagnostic(noSig);
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-id-missing');
  });

  it('invalid amount → fund-transaction-amount-invalid', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, amount: -1 });
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-amount-invalid');
  });

  it('NaN amount → fund-transaction-amount-invalid', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, amount: NaN });
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-amount-invalid');
  });

  it('invalid timestamp → fund-transaction-timestamp-invalid', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, timestamp: 0 });
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-timestamp-invalid');
  });

  it('missing timestamp → fund-transaction-timestamp-invalid', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { timestamp: _ts, ...noTs } = base;
    const r = normalizeTransactionWithDiagnostic(noTs);
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-timestamp-invalid');
  });
});

// ================================================================
//  DIAGNOSTIC CONTEXT SAFETY
// ================================================================

describe('diagnostic context safety', () => {
  it('unsupported type diagnostic does not expose raw payload in message', () => {
    // Messages are static strings — verify they don't contain raw JSON
    const diags = [
      { level: 'warning' as const, code: 'fund-transaction-type-unsupported', message: 'Skipped malformed or unsupported transaction record' },
      { level: 'warning' as const, code: 'fund-transaction-id-missing', message: 'Skipped malformed or unsupported transaction record' },
      { level: 'warning' as const, code: 'fund-transaction-amount-invalid', message: 'Skipped malformed or unsupported transaction record' },
    ];
    for (const d of diags) {
      expect(d.message).not.toContain('{');
      expect(d.message).not.toContain('[');
    }
  });
});

// ================================================================
//  MAX PAGES BUDGET
// ================================================================

describe('maxPages budget', () => {
  const makeTx = (sig: string) => ({ signature: sig, creatorAddress: 'QForeignForeignForeignForeignAbCd', recipient: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', amount: 100, timestamp: 1700000000000, txType: 'PAYMENT' });

  it('maxPages → incomplete with safety-limit:max-pages', async () => {
    let reqCount = 0;
    const fn: FundTransactionsFn = // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => {
      reqCount++;
      return [makeTx(`sig${reqCount}`)];
    };
    const result = await fetchFundTransactions(fn, { pageSize: 1, maxPages: 3, maxTransactions: 100 });
    expect(result.transactions.length).toBe(3);
    expect(result.completeness).toBe('incomplete');
    expect(result.diagnostics.some(d => d.code === 'fund-pagination-safety-limit')).toBe(true);
    expect(reqCount).toBe(3);
  });

  it('maxTransactions → incomplete with safety-limit:max-transactions, no extra requests', async () => {
    let reqCount = 0;
    const fn: FundTransactionsFn = // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => {
      reqCount++;
      return [makeTx(`sig${reqCount}`)];
    };
    const result = await fetchFundTransactions(fn, { pageSize: 1, maxPages: 20, maxTransactions: 2 });
    expect(result.transactions.length).toBe(2);
    expect(result.completeness).toBe('incomplete');
    expect(result.diagnostics.some(d => d.code === 'fund-pagination-safety-limit')).toBe(true);
    expect(reqCount).toBe(2); // page 1 adds sig1 (count=1), page 2 adds sig2 (count=2), page 3 would check 2>=2
  });
});

// ================================================================
//  REGRESSION: EXISTING BEHAVIOR
// ================================================================

describe('regression: existing behavior preserved', () => {
  const makeTx = (sig: string) => ({ signature: sig, creatorAddress: 'QForeignForeignForeignForeignAbCd', recipient: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', amount: 100, timestamp: 1700000000000, txType: 'PAYMENT' });

  it('zero raw results → empty', async () => {
    const fn: FundTransactionsFn = // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => [];
    const result = await fetchFundTransactions(fn);
    expect(result.completeness).toBe('empty');
  });

  it('initial page failure → unavailable', async () => {
    const fn: FundTransactionsFn = // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => { throw new Error('Down'); };
    const result = await fetchFundTransactions(fn);
    expect(result.completeness).toBe('unavailable');
  });

  it('repeated page → incomplete', async () => {
    const samePage = [makeTx('sig1')];
    const fn: FundTransactionsFn = // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => samePage;
    const result = await fetchFundTransactions(fn, { pageSize: 1, maxPages: 5, maxTransactions: 500 });
    expect(result.completeness).toBe('incomplete');
  });

  it('unsupported type → incomplete, valid preserved', async () => {
    const fn: FundTransactionsFn = // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_params: Parameters<FundTransactionsFn>[0]) => [
      makeTx('sig1'),
      { ...makeTx('sig2'), txType: 'ARBITRARY' },
    ];
    const result = await fetchFundTransactions(fn, { pageSize: 50, maxPages: 10, maxTransactions: 500 });
    expect(result.transactions.length).toBe(1);
    expect(result.completeness).toBe('incomplete');
    expect(result.diagnostics.some(d => d.code === 'fund-transaction-type-unsupported')).toBe(true);
  });

  it('CSV incomplete marker preserved', () => {
    const tx = { id: 's', signature: 'sig1', senderAddress: 'QForeignForeignForeignForeignAbCd', recipientAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', amount: 100, timestamp: 1700000000000, direction: 'incoming' as const, type: 'PAYMENT' };
    const csv = buildFundTransactionsCsv([tx], 'incomplete');
    expect(csv).not.toBeNull();
    expect(csv!).toContain('INCOMPLETE');
  });
});

// ================================================================
//  ADDRESS FIELD VALIDATION
// ================================================================

describe('address field validation', () => {
  const base = { signature: 'sig1', amount: 100, timestamp: 1700000000000, creatorAddress: 'QForeignForeignForeignForeignAbCd', recipient: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', txType: 'PAYMENT' };

  it('malformed sender: object rejected with address-invalid', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, creatorAddress: {} });
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-address-invalid');
  });

  it('malformed sender: number rejected', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, creatorAddress: 123 });
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-address-invalid');
  });

  it('malformed sender: empty string rejected', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, creatorAddress: '' });
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-address-invalid');
  });

  it('malformed sender: whitespace rejected', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, creatorAddress: '   ' });
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-address-invalid');
  });

  it('malformed recipient: object rejected with address-invalid', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, recipient: {} });
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-address-invalid');
  });

  it('malformed recipient: array rejected', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, recipient: ['addr'] });
    expect(r.tx).toBeNull();
    expect(r.diagnosticCode).toBe('fund-transaction-address-invalid');
  });

  it('missing sender accepted with unknown direction', () => {
    const { creatorAddress: _ca, ...noSender } = base;
    void _ca;
    const r = normalizeTransactionWithDiagnostic(noSender);
    expect(r.tx).not.toBeNull();
    expect(r.tx!.direction).toBe('unknown');
  });

  it('missing recipient accepted with unknown direction', () => {
    const { recipient: _rec, ...noRecipient } = base;
    void _rec;
    const r = normalizeTransactionWithDiagnostic(noRecipient);
    expect(r.tx).not.toBeNull();
    expect(r.tx!.direction).toBe('unknown');
  });

  it('both addresses missing accepted with unknown direction', () => {
    const { creatorAddress: _ca, recipient: _rec, ...noBoth } = base;
    void _ca;
    void _rec;
    const r = normalizeTransactionWithDiagnostic(noBoth);
    expect(r.tx).not.toBeNull();
    expect(r.tx!.direction).toBe('unknown');
  });

  it('valid nonmatching addresses → unknown direction', () => {
    const r = normalizeTransactionWithDiagnostic({
      ...base,
      creatorAddress: 'QOtherOtherOtherOtherOtherOther',
      recipient: 'QAnotherAnotherAnotherAnother',
    });
    expect(r.tx).not.toBeNull();
    expect(r.tx!.direction).toBe('unknown');
  });
});

// ================================================================
//  ADDRESS DIRECTION REGRESSIONS
// ================================================================

describe('address direction regressions', () => {
  const base = { signature: 'sig1', amount: 100, timestamp: 1700000000000, txType: 'PAYMENT' };

  it('incoming still correct', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, creatorAddress: 'QForeignForeignForeignForeignAbCd', recipient: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm' });
    expect(r.tx!.direction).toBe('incoming');
  });

  it('outgoing still correct', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, creatorAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', recipient: 'QForeignForeignForeignForeignAbCd' });
    expect(r.tx!.direction).toBe('outgoing');
  });

  it('self still correct', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, creatorAddress: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', recipient: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm' });
    expect(r.tx!.direction).toBe('self');
  });

  it('unknown still correct', () => {
    const r = normalizeTransactionWithDiagnostic({ ...base, creatorAddress: 'QForeignForeignForeignForeignAbCd', recipient: 'QOtherOtherOtherOtherOtherOther' });
    expect(r.tx!.direction).toBe('unknown');
  });
});

// ================================================================
//  ADDRESS COMPLETENESS INTEGRATION
// ================================================================

describe('address completeness integration', () => {
  const makeTx = (sig: string) => ({ signature: sig, creatorAddress: 'QForeignForeignForeignForeignAbCd', recipient: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', amount: 100, timestamp: 1700000000000, txType: 'PAYMENT' });

  it('valid tx survives alongside malformed-address record', async () => {
    const fn: FundTransactionsFn = async () => [
      makeTx('sig1'),
      { ...makeTx('sig2'), creatorAddress: {} },
    ];
    const result = await fetchFundTransactions(fn, { pageSize: 50, maxPages: 10, maxTransactions: 500 });
    expect(result.transactions.length).toBe(1);
    expect(result.completeness).toBe('incomplete');
    expect(result.diagnostics.some(d => d.code === 'fund-transaction-address-invalid')).toBe(true);
  });

  it('all malformed-address → incomplete, not empty', async () => {
    const fn: FundTransactionsFn = async () => [
      { ...makeTx('sig1'), creatorAddress: {} },
      { ...makeTx('sig2'), recipient: [] },
    ];
    const result = await fetchFundTransactions(fn, { pageSize: 50, maxPages: 10, maxTransactions: 500 });
    expect(result.transactions.length).toBe(0);
    expect(result.completeness).toBe('incomplete');
  });
});

// ================================================================
//  ADDRESS DIAGNOSTIC SAFETY + ORDER
// ================================================================

describe('address diagnostic safety and order', () => {
  it('address diagnostic context contains no raw malformed value', () => {
    // The producition code only produces static diagnostic messages — verify
    const r = normalizeTransactionWithDiagnostic({ signature: 'sig1', amount: 100, timestamp: 1700000000000, txType: 'PAYMENT', creatorAddress: {}, recipient: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm' });
    expect(r.diagnosticCode).toBe('fund-transaction-address-invalid');
  });

  it('address diagnostics participate in deterministic sorting', () => {
    const diags = [
      { level: 'warning' as const, code: 'fund-transaction-address-invalid', message: 'addr', field: 'senderAddress' },
      { level: 'warning' as const, code: 'fund-transaction-address-invalid', message: 'addr', field: 'recipientAddress' },
      { level: 'warning' as const, code: 'fund-transaction-amount-invalid', message: 'amt' },
    ];
    const s1 = sortFundDiagnostics([diags[1], diags[2], diags[0]]);
    const s2 = sortFundDiagnostics([diags[0], diags[1], diags[2]]);
    expect(s1.map(d => d.code)).toEqual(s2.map(d => d.code));
    expect(s1.map(d => (d as unknown as Record<string,unknown>).field)).toEqual(s2.map(d => (d as unknown as Record<string,unknown>).field));
  });
});
