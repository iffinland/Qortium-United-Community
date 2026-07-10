// ===== Redux Store – Fund Slice =====

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { FundTransaction } from '../../types';

interface FundState {
  balance: number;
  transactions: FundTransaction[];
  isLoading: boolean;
  error: string | null;
}

const mockTransactions: FundTransaction[] = [
  {
    id: 'tx1',
    from: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
    to: 'QN2ABcdEfghIjklMnOpQrStUvWxYz1234',
    amount: 500,
    description: 'Support for the "Green Park" community project',
    timestamp: '2026-07-01T10:30:00Z',
    txHash: '0xabc123def456',
  },
  {
    id: 'tx2',
    from: 'QN3XYzAbCdEfGhIjKlMnOpQrStUvWxYz',
    to: 'QN4MnOpQrStUvWxYzAbCdEfGhIjKl123',
    amount: 250,
    description: 'Support for the "Young Coders" education project',
    timestamp: '2026-06-28T14:15:00Z',
    txHash: '0x789ghi012jkl',
  },
  {
    id: 'tx3',
    from: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm',
    to: 'QN5StUvWxYzAbCdEfGhIjKlMnOpQr678',
    amount: 1000,
    description: 'Organization costs for the "Summer Days 2026" community event',
    timestamp: '2026-06-20T09:00:00Z',
    txHash: '0x345mno678pqr',
  },
  {
    id: 'tx4',
    from: 'QN6EfGhIjKlMnOpQrStUvWxYzAbCd901',
    to: 'QN2ABcdEfghIjklMnOpQrStUvWxYz1234',
    amount: 150,
    description: 'Donation to the community library',
    timestamp: '2026-06-15T16:45:00Z',
    txHash: '0x901stu234vwx',
  },
];

const initialState: FundState = {
  balance: 8750.5,
  transactions: mockTransactions,
  isLoading: false,
  error: null,
};

const fundSlice = createSlice({
  name: 'fund',
  initialState,
  reducers: {
    setBalance: (state, action: PayloadAction<number>) => {
      state.balance = action.payload;
    },
    addTransaction: (state, action: PayloadAction<FundTransaction>) => {
      state.transactions.unshift(action.payload);
    },
    setTransactions: (state, action: PayloadAction<FundTransaction[]>) => {
      state.transactions = action.payload;
    },
    setFundLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setFundError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  setBalance: setFundBalance,
  addTransaction,
  setTransactions,
  setFundLoading,
  setFundError,
} = fundSlice.actions;
export default fundSlice.reducer;
