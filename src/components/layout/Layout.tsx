// ===== Main Layout =====

import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

interface LayoutProps {
  children: ReactNode;
  isDark: boolean;
  onToggleTheme: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const Layout = ({
  children,
  isDark,
  onToggleTheme,
  searchQuery,
  onSearchChange,
}: LayoutProps) => {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-surface-app)]">
      <Header
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />

      <div className="flex flex-1">
        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>

        {/* Desktop Sidebar */}
        <div className="hidden shrink-0 border-l border-[var(--color-border-subtle)] bg-[var(--color-surface-sidebar)] px-4 py-6 lg:block lg:w-80">
          <div className="sticky top-6">
            <Sidebar />
          </div>
        </div>

        {/* Mobile Sidebar Toggle */}
        <button
          onClick={() => setShowMobileSidebar(true)}
          className="fixed bottom-4 right-4 z-40 rounded-full bg-cyan-600 p-3 text-white shadow-lg transition hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 lg:hidden"
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Mobile Sidebar Overlay */}
        {showMobileSidebar && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowMobileSidebar(false)}
            />
            <div className="absolute right-0 top-0 h-full w-80 overflow-y-auto bg-[var(--color-surface-sidebar)] shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] p-4">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Community Info
                </h2>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4">
                <Sidebar />
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Layout;
