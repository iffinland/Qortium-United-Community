// ===== Main Layout =====

import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({
  children,
}: LayoutProps) => {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <div className="mx-auto flex w-full max-w-[1760px] flex-1">
        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          {children}
        </main>

        {/* Desktop Sidebar */}
        <div className="hidden shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface-sidebar)] px-4 py-6 lg:block lg:w-[300px] xl:w-[360px]">
          <div className="sticky top-6">
            <Sidebar />
          </div>
        </div>

        {/* Mobile Sidebar Toggle */}
        <button
          onClick={() => setShowMobileSidebar(true)}
          className="fixed bottom-4 right-4 z-40 rounded-full bg-[var(--color-accent)] p-3 text-white shadow-lg transition hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 lg:hidden"
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
              <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Community Info
                </h2>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
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
