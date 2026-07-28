// ===== Fund Configuration =====
//
// Single canonical source for the community fund wallet address.
// Environment override: VITE_FUND_ADDRESS
// Fallback: hardcoded application default.
//
// Classification: STRUCTURAL Q-ADDRESS VALIDATION only.
// Checksum: NOT VERIFIED. Ownership: NOT VERIFIED.

import { z } from 'zod';

// ---- Wallet Address Validator ----

const fundWalletRegex = /^Q[A-Za-z0-9]{32,35}$/;

const fundWalletSchema = z.string().min(33).max(36).regex(fundWalletRegex, 'Invalid fund wallet address format');

export type FundConfigStatus = 'valid' | 'invalid' | 'missing';

export interface FundConfig {
  walletAddress: string;
  status: FundConfigStatus;
  /** Informational target only — not canonical donation total authority. */
  informationalTarget?: number;
  assetSymbol: string;
}

function resolveWallet(): { address: string; status: FundConfigStatus } {
  const envAddr = import.meta.env.VITE_FUND_ADDRESS as string | undefined;
  if (envAddr) {
    const result = fundWalletSchema.safeParse(envAddr.trim());
    if (result.success) return { address: result.data, status: 'valid' };
    return { address: '', status: 'invalid' };
  }
  const fallback = 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm';
  const result = fundWalletSchema.safeParse(fallback);
  if (result.success) return { address: result.data, status: 'valid' };
  return { address: '', status: 'invalid' };
}

const resolved = resolveWallet();

export const fundConfig: FundConfig = {
  walletAddress: resolved.address,
  status: resolved.status,
  informationalTarget: 25000,
  assetSymbol: 'QORT',
};
