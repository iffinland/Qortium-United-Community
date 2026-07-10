// ===== Fund Balance Display =====

import { Coins } from 'lucide-react';
import { useGetFundBalanceQuery } from '../../store/api/qortiumApi';

interface FundBalanceProps {
  className?: string;
}

const FundBalance = ({ className = '' }: FundBalanceProps) => {
  const { data: balance, isLoading } = useGetFundBalanceQuery();

  return (
    <div className={`hidden items-center gap-2 rounded-lg px-2.5 py-1.5 transition hover:bg-white/5 sm:flex ${className}`}>
      <Coins className="h-4 w-4 text-amber-400" />
      <div className="hidden text-right leading-tight lg:block">
        <p className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
          Fund
        </p>
        <p className="text-sm font-bold text-white tabular-nums">
          {isLoading ? '...' : `${(balance ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} QORT`}
        </p>
      </div>
    </div>
  );
};

export default FundBalance;
