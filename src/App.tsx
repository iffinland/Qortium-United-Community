// ===== Qortium United Community – App Root =====

import { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import { useAppDispatch, useAppSelector } from './store';
import { initializeAuth } from './store/slices/authSlice';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ToastProvider } from './components/common/ToastProvider';

// Lazy-loaded pages for code splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const PollsPage = lazy(() => import('./pages/PollsPage'));
const DonationsPage = lazy(() => import('./pages/DonationsPage'));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ForumPage = lazy(() => import('./pages/ForumPage'));
const ForumCategoryPage = lazy(() => import('./pages/ForumCategoryPage'));
const ForumThreadPage = lazy(() => import('./pages/ForumThreadPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const TicketDetailPage = lazy(() => import('./pages/TicketDetailPage'));
const WikiPage = lazy(() => import('./pages/WikiPage'));
const WikiArticlePage = lazy(() => import('./pages/WikiArticlePage'));
const WikiEditPage = lazy(() => import('./pages/WikiEditPage'));

const PageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
  </div>
);

const THEME_KEY = 'quc-theme';

const AppRoutes = () => {
  const dispatch = useAppDispatch();
  const { error } = useAppSelector((state) => state.auth);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    dispatch(initializeAuth());
  }, [dispatch]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  const handleSearch = (q: string) => setSearchQuery(q);

  if (error) {
    console.warn('Auth initialization:', error);
  }

  return (
    <Layout
      isDark={isDark}
      onToggleTheme={() => setIsDark((d) => !d)}
      searchQuery={searchQuery}
      onSearchChange={handleSearch}
    >
      <Routes>
        <Route path="/" element={<Suspense fallback={<PageLoader />}><HomePage searchQuery={searchQuery} /></Suspense>} />
        <Route path="/projects" element={<Suspense fallback={<PageLoader />}><ProjectsPage /></Suspense>} />
        <Route path="/project/:entityId" element={<Suspense fallback={<PageLoader />}><ProjectDetailPage /></Suspense>} />
        <Route path="/polls" element={<Suspense fallback={<PageLoader />}><PollsPage /></Suspense>} />
        <Route path="/donations" element={<Suspense fallback={<PageLoader />}><DonationsPage /></Suspense>} />
        <Route path="/post/:id" element={<Suspense fallback={<PageLoader />}><PostDetailPage /></Suspense>} />
        <Route path="/admin" element={<Suspense fallback={<PageLoader />}><AdminPage /></Suspense>} />
        <Route path="/profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
        <Route path="/forum" element={<Suspense fallback={<PageLoader />}><ForumPage /></Suspense>} />
        <Route path="/forum/:categoryId" element={<Suspense fallback={<PageLoader />}><ForumCategoryPage /></Suspense>} />
        <Route path="/forum/:categoryId/:threadId" element={<Suspense fallback={<PageLoader />}><ForumThreadPage /></Suspense>} />
        <Route path="/support" element={<Suspense fallback={<PageLoader />}><SupportPage /></Suspense>} />
        <Route path="/support/:ticketId" element={<Suspense fallback={<PageLoader />}><TicketDetailPage /></Suspense>} />
        <Route path="/wiki" element={<Suspense fallback={<PageLoader />}><WikiPage /></Suspense>} />
        <Route path="/wiki/new" element={<Suspense fallback={<PageLoader />}><WikiEditPage /></Suspense>} />
        <Route path="/wiki/:slug" element={<Suspense fallback={<PageLoader />}><WikiArticlePage /></Suspense>} />
        <Route path="/wiki/:slug/edit" element={<Suspense fallback={<PageLoader />}><WikiEditPage /></Suspense>} />
      </Routes>
    </Layout>
  );
};

// QDN base path support (for Q-App compatibility)
const qdnWindow = window as Window & { _qdnBase?: string };
const routerBasename = qdnWindow._qdnBase || '';

const App = () => (
  <BrowserRouter basename={routerBasename}>
    <ToastProvider>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </ToastProvider>
  </BrowserRouter>
);

export default App;
