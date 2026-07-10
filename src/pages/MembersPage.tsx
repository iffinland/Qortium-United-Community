// ===== Members Page =====

import { Shield, Search } from 'lucide-react';
import { useState } from 'react';
import UserRoleBadge from '../components/common/UserRoleBadge';
import type { UserRole } from '../types';

interface Member {
  address: string;
  name: string;
  role: UserRole;
  joinedAt: string;
  balance?: number;
}

const mockMembers: Member[] = [
  { address: 'QWifxJWGbJZ6Yo6kiimFkBGcm4AxQefdUm', name: 'Qortian', role: 'SysOp', joinedAt: '2026-01-15', balance: 12500 },
  { address: 'QN3XYzAbCdEfGhIjKlMnOpQrStUvWxYz', name: 'AdminKati', role: 'Admin', joinedAt: '2026-02-01', balance: 3400 },
  { address: 'QN7ModSquadLeaderXyzAbc123', name: 'ModMark', role: 'Moderator', joinedAt: '2026-03-10', balance: 1200 },
  { address: 'QN2ABcdEfghIjklMnOpQrStUvWxYz1234', name: 'GreenFriend', role: 'Creator', joinedAt: '2026-04-05', balance: 890 },
  { address: 'QN4MnOpQrStUvWxYzAbCdEfGhIjKl123', name: 'TechTom', role: 'Creator', joinedAt: '2026-04-20', balance: 2500 },
  { address: 'QN6EfGhIjKlMnOpQrStUvWxYzAbCd901', name: 'ReaderLisa', role: 'Creator', joinedAt: '2026-05-01', balance: 450 },
  { address: 'QN8AlphaBetaGammaDelta123', name: 'CryptoFan', role: 'Member', joinedAt: '2026-05-15', balance: 320 },
  { address: 'QN9ZetaEtaThetaIota456', name: 'BlockchainB', role: 'Member', joinedAt: '2026-06-01', balance: 150 },
  { address: 'QN10KappaLambdaMuNu789', name: 'NodeRunner', role: 'Member', joinedAt: '2026-06-15', balance: 780 },
  { address: 'QN11XiOmicronPiRho012', name: 'Web3Dev', role: 'Member', joinedAt: '2026-07-01', balance: 95 },
];

const roleOrder: Record<UserRole, number> = {
  SysOp: 0, SuperAdmin: 1, Admin: 2, Moderator: 3, Creator: 4, Member: 5,
};

const MembersPage = () => {
  const [search, setSearch] = useState('');

  const filtered = mockMembers
    .filter((m) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.address.toLowerCase().includes(q);
    })
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          Community Members
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          {filtered.length} members in the community
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or address..."
          className="w-full rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] py-2.5 pl-9 pr-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
        />
      </div>

      {/* Members list */}
      <div className="space-y-2">
        {filtered.map((member) => (
          <div
            key={member.address}
            className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-card)] p-4 shadow-sm transition hover:shadow-md"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-sm font-bold text-white">
              {member.name
                .split(' ')
                .map((p) => p[0]?.toUpperCase() ?? '')
                .join('')
                .slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                  {member.name}
                </p>
                <UserRoleBadge role={member.role} />
              </div>
              <code className="text-[11px] text-[var(--color-text-muted)]">
                {member.address.slice(0, 10)}...{member.address.slice(-6)}
              </code>
            </div>
            <div className="hidden shrink-0 text-right sm:block">
              {member.balance !== undefined && (
                <p className="text-sm font-semibold tabular-nums text-emerald-600">
                  {member.balance.toLocaleString('en-US')} QORT
                </p>
              )}
              <p className="text-[10px] text-[var(--color-text-muted)]">
                Joined {new Date(member.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </p>
            </div>
            {member.role !== 'Member' && (
              <Shield className="hidden h-4 w-4 shrink-0 text-[var(--color-text-muted)] sm:block" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MembersPage;
