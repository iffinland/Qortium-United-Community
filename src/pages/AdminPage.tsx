// ===== Admin Page – Content Management Shell =====
//
// Only accessible to Admin+ roles. Each section owns exactly one domain so
// selecting a section never shows another domain's content below it.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FilePenLine,
  LifeBuoy,
  FolderKanban,
  BarChart3,
  BookOpen,
  Calendar,
  Shield,
} from 'lucide-react';
import { useAppSelector } from '../store';
import PostManager from '../components/admin/PostManager';
import SupportCategoryManager from '../components/admin/SupportCategoryManager';
import SupportTicketManager from '../components/admin/SupportTicketManager';
import ProjectManager from '../components/admin/ProjectManager';
import PollManager from '../components/admin/PollManager';
import WikiManager from '../components/admin/WikiManager';
import EventManager from '../components/admin/EventManager';
import AdminManagement from '../components/admin/AdminManagement';

type AdminSectionKey =
  | 'posts'
  | 'support-categories'
  | 'support-tickets'
  | 'projects'
  | 'polls'
  | 'wiki'
  | 'events'
  | 'admin-management';

interface AdminSectionItem {
  key: AdminSectionKey;
  label: string;
  icon: typeof FilePenLine;
}

const ADMIN_ROLES = new Set(['SysOp', 'Admin']);

const AdminPage = () => {
  const navigate = useNavigate();
  const { role, isAuthenticated } = useAppSelector((state) => state.auth);
  const [activeSection, setActiveSection] = useState<AdminSectionKey>('posts');

  if (!isAuthenticated || !ADMIN_ROLES.has(role)) {
    return (
      <div className="rounded-xl border border-amber-800 bg-amber-950 p-8 text-center">
        <Shield className="mx-auto mb-3 h-12 w-12 text-amber-400" />
        <h1 className="mb-2 text-xl font-bold text-amber-300">
          Admin Access Required
        </h1>
        <p className="mb-4 text-sm text-amber-400">
          You need Admin or SysOp role to access this page.
        </p>
        <button
          onClick={() => navigate('/')}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const contentSections: AdminSectionItem[] = [
    { key: 'posts', label: 'Posts', icon: FilePenLine },
    { key: 'support-categories', label: 'Support Categories', icon: LifeBuoy },
    { key: 'support-tickets', label: 'Support Tickets', icon: LifeBuoy },
    { key: 'projects', label: 'Projects', icon: FolderKanban },
    { key: 'polls', label: 'Polls', icon: BarChart3 },
    { key: 'events', label: 'Events', icon: Calendar },
    { key: 'wiki', label: 'Wiki', icon: BookOpen },
  ];

  const systemSections: AdminSectionItem[] =
    role === 'SysOp'
      ? [{ key: 'admin-management', label: 'Admin Management', icon: Shield }]
      : [];

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'posts':
        return <PostManager />;
      case 'support-categories':
        return <SupportCategoryManager />;
      case 'support-tickets':
        return <SupportTicketManager />;
      case 'projects':
        return <ProjectManager />;
      case 'polls':
        return <PollManager />;
      case 'wiki':
        return <WikiManager />;
      case 'events':
        return <EventManager />;
      case 'admin-management':
        return role === 'SysOp' ? <AdminManagement /> : null;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          Admin Panel
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Manage community content from one location
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="shrink-0 lg:w-60">
          <nav className="flex gap-1 overflow-x-auto rounded-xl bg-[var(--color-surface-card)] p-1.5 shadow-sm lg:flex-col lg:overflow-visible">
            {contentSections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  activeSection === section.key
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <section.icon className="h-4 w-4" />
                {section.label}
              </button>
            ))}

            {systemSections.length > 0 && (
              <>
                <div className="my-1 hidden h-px bg-[var(--color-border-subtle)] lg:block" />
                {systemSections.map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setActiveSection(section.key)}
                    className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      activeSection === section.key
                        ? 'bg-amber-600 text-white'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    <section.icon className="h-4 w-4" />
                    {section.label}
                  </button>
                ))}
              </>
            )}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">{renderActiveSection()}</div>
      </div>
    </div>
  );
};

export default AdminPage;
