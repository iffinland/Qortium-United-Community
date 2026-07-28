// ===== Fund RTK Query API =====
//
// Core-authoritative global fund wallet activity.
// Balance and transactions come from Qortium Core, not QDN.

import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { requestQortium } from '../../services/qortium/qortiumClient';
import {
  fetchFundBalance,
  fetchFundTransactions,
  composeFundOverview,
  type FundBalanceResult,
  type FundTransaction,
  type FundTransactionPage,
  type FundCompleteness,
  type FundOverview,
} from '../../services/fund/fundRuntime';
// ---- View Model ----

export interface FundView {
  walletAddress: string;
  configStatus: string;
  balance: FundBalanceResult;
  transactions: FundTransaction[];
  transactionCompleteness: FundCompleteness;
}

// ---- Helpers ----

const queryFn = async <T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> => {
  try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err.message : 'Failed.' }; }
};

// ---- Bridge Functions ----

const balanceFn = async (address: string) =>
  requestQortium<unknown>({ action: 'GET_BALANCE', address });

const txFn = async (params: { address: string; limit: number; offset: number; reverse: boolean }) => {
  const raw = await requestQortium<unknown>({
    action: 'FETCH_NODE_API',
    path: `/transactions/search?address=${params.address}&limit=${params.limit}&offset=${params.offset}&reverse=${params.reverse}`,
    method: 'GET',
  });
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(parsed)) throw new Error('Invalid transaction response');
  return parsed as unknown[];
};

// ---- API ----

export const fundApi = createApi({
  reducerPath: 'fundApi',
  baseQuery: fakeBaseQuery<string>(),
  tagTypes: ['Fund'],
  endpoints: (builder) => ({

    getFundOverview: builder.query<FundOverview, void>({
      queryFn: () => queryFn(async () => {
        const [balance, txPage] = await Promise.all([
          fetchFundBalance(balanceFn),
          fetchFundTransactions(txFn),
        ]);
        return composeFundOverview(balance, txPage);
      }),
      providesTags: ['Fund'],
    }),

    getFundBalance: builder.query<FundBalanceResult, void>({
      queryFn: () => queryFn(() => fetchFundBalance(balanceFn)),
      providesTags: ['Fund'],
    }),

    getFundTransactions: builder.query<FundTransactionPage, void>({
      queryFn: () => queryFn(() => fetchFundTransactions(txFn)),
      providesTags: ['Fund'],
    }),
  }),
});

export const {
  useGetFundOverviewQuery,
  useGetFundBalanceQuery,
  useGetFundTransactionsQuery,
} = fundApi;
