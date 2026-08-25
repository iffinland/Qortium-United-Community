// ===== Main Header / Banner Component =====

import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  Home,
  FolderKanban,
  BarChart3,
  Heart,
  Menu,
  X,
  Settings,
  User,
  Wifi,
  WifiOff,
  MessageSquare,
  LifeBuoy,
  BookOpen,
  Calendar,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { useAppSelector } from '../../store';
import { isQortiumBridgeAvailable, requestQortium } from '../../services/qortium/qortiumClient';
import UserRoleBadge from '../common/UserRoleBadge';
import FundBalance from '../common/FundBalance';
import GlobalSearch from '../search/GlobalSearch';

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/forum', label: 'Forum', icon: MessageSquare },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/polls', label: 'Polls', icon: BarChart3 },
  { to: '/events', label: 'Events', icon: Calendar },
  { to: '/donations', label: 'Donations', icon: Heart },
  { to: '/support', label: 'Support', icon: LifeBuoy },
  { to: '/wiki', label: 'Wiki', icon: BookOpen },
];

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { name, role, isAuthenticated, isLoading } = useAppSelector(
    (state) => state.auth
  );

  const isAdmin =
    isAuthenticated &&
    (role === 'SysOp' || role === 'Admin');

  const bridgeAvailable = isQortiumBridgeAvailable();

  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);

  const { address } = useAppSelector((s) => s.auth);

  // Fetch user balance when popup opens
  useEffect(() => {
    if (!showProfilePopup || !address) return;
    let cancelled = false;
    requestQortium<unknown>({ action: 'GET_BALANCE', address })
      .then((raw) => {
        if (cancelled) return;
        if (typeof raw === 'number') setUserBalance(raw);
        else if (typeof raw === 'string') { const p = Number(raw); if (Number.isFinite(p)) setUserBalance(p / 1e8); }
        else if (raw && typeof raw === 'object') {
          const r = raw as Record<string, unknown>;
          for (const k of ['balance', 'value', 'amount', 'confirmedBalance']) {
            const v = r[k];
            if (typeof v === 'number') { setUserBalance(v / 1e8); break; }
            if (typeof v === 'string') { const p = Number(v); if (Number.isFinite(p)) { setUserBalance(p / 1e8); break; } }
          }
        }
      })
      .catch(() => {
        if (!cancelled) setUserBalance(null);
      });
    return () => { cancelled = true; };
  }, [showProfilePopup, address]);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard?.writeText(address).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = address;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      });
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    }
  };

  const initialsFromName = (displayName: string | null) => {
    if (!displayName) return 'Q';
    return displayName
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2);
  };

  return (
    <header className="relative z-30 bg-gradient-to-br from-[var(--color-surface-banner)] via-[var(--color-surface-banner-accent)] to-[var(--color-surface-banner)] text-white">
      {/* Subtle background pattern */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 50%, var(--color-accent) 1px, transparent 1px), radial-gradient(circle at 80% 20%, var(--color-accent) 1px, transparent 1px)',
          backgroundSize: '40px 40px, 60px 60px',
        }}
      />

      {/* Top bar: User info (left) + Fund balance + controls (right) */}
      <div className="relative flex items-center gap-3 px-4 py-3 sm:px-6">
        {/* Avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-[var(--color-accent)] text-sm font-bold text-white shadow-lg shadow-cyan-500/25">
          {isLoading ? (
            <span className="animate-pulse">...</span>
          ) : (
            initialsFromName(name)
          )}
        </div>

        {/* User details */}
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="space-y-1">
              <div className="h-4 w-24 animate-pulse rounded bg-white/20" />
              <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
            </div>
          ) : isAuthenticated ? (
            <>
              <p className="truncate text-sm font-semibold leading-tight">
                {name || 'Unnamed User'}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <UserRoleBadge role={role} />
              </div>
            </>
          ) : (
            <p className="text-sm font-medium tracking-wide text-slate-300">
              Qortium United Community
            </p>
          )}
        </div>

        {/* Right side: Fund balance (desktop) + theme */}
        <div className="flex items-center gap-1">
          <FundBalance />

          {/* Node status */}
          <span className={`hidden items-center gap-0.5 sm:flex`} title={bridgeAvailable ? 'Connected to Qortium node' : 'Not connected (dev mode)'}>
            <span className={`rounded p-1 text-xs transition hover:bg-white/5 ${bridgeAvailable ? 'text-emerald-400' : 'text-amber-400'}`}>
              {bridgeAvailable ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            </span>
          </span>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="rounded-md p-1.5 text-slate-300 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400 lg:hidden"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Navigation bar */}
      <nav className="border-t border-white/10 bg-[var(--color-surface-banner-accent)] px-6">
        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-cyan-400 text-white'
                    : 'text-slate-400 hover:text-white'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}

          {/* Spacer to push fund balance right on mobile */}
          <div className="flex-1" />

          {/* Search bar */}
          <div className="relative mx-2 hidden w-44 md:block md:w-56">
            <GlobalSearch />
          </div>

          {/* Profile popup trigger */}
          <div className="relative">
            <button
              onClick={() => setShowProfilePopup(!showProfilePopup)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:text-white"
            >
              <User className="h-4 w-4" />
              <span className="hidden xl:inline">Profile</span>
            </button>

            {showProfilePopup && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfilePopup(false)} />
                <div className="absolute right-0 top-full z-[60] mt-1 w-64 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-4 text-[var(--color-text-primary)] shadow-xl">
                  {/* Avatar + Name */}
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-[var(--color-accent)] text-sm font-bold text-white">
                      {initialsFromName(name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{name || 'Unnamed User'}</p>
                      <UserRoleBadge role={role} />
                    </div>
                  </div>

                  {/* Address */}
                  <div className="mb-3 rounded-lg bg-[var(--color-surface-muted)]/50 p-2">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Wallet Address</p>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 truncate text-xs">{address?.slice(0, 12)}...{address?.slice(-8)}</code>
                      <button onClick={copyAddress} className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] transition hover:bg-slate-700">
                        {addressCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Balance */}
                  <div className="mb-3 rounded-lg bg-[var(--color-surface-muted)]/50 p-2">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Balance</p>
                    {userBalance === null ? (
                      <div className="h-5 w-20 animate-pulse rounded bg-[var(--color-surface-muted)]" />
                    ) : (
                      <p className="text-sm font-semibold tabular-nums text-[var(--color-success)]">
                        {userBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })} QORT
                      </p>
                    )}
                  </div>

                  {/* Full profile link */}
                  <Link
                    to="/profile"
                    onClick={() => setShowProfilePopup(false)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] py-2 text-xs font-medium text-white transition hover:bg-[var(--color-accent-hover)]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Full Profile
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Admin link */}
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-amber-400 text-white'
                    : 'text-slate-400 hover:text-white'
                }`
              }
            >
              <Settings className="h-4 w-4" />
              Admin
            </NavLink>
          )}

          {/* Fund balance – visible inline on smaller screens */}
          <div className="lg:hidden">
            <FundBalance />
          </div>
        </div>

        {/* Mobile nav */}
        {isMobileMenuOpen && (
          <div className="flex flex-col gap-1 py-3 lg:hidden">
            <div className="px-3 pb-2">
              <GlobalSearch />
            </div>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--color-accent)]/20 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/admin"
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-500/20 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <Settings className="h-4 w-4" />
                Admin
              </NavLink>
            )}
          </div>
        )}
      </nav>
    </header>
  );
};

export default Header;
