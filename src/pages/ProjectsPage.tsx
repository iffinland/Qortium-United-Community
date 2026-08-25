// ===== Projects Page – Canonical QDN Architecture =====
//
// Read-only public project discovery. Project creation is an Admin-panel
// operation, so this page intentionally exposes no create control.

import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle2, Circle, Archive, AlertTriangle, FolderKanban } from 'lucide-react';
import { useGetProjectsQuery } from '../store/api/projectApi';
import { useAppSelector } from '../store';
import type { ProjectStatus } from '../services/qdn/schemas/projectSchema';
import { QdnImage } from '../components/editor/QdnImage';
import { toPlainTextPreview } from '../services/rich-text/richText';

const STATUS_CONFIG: Record<ProjectStatus, { label: string; icon: typeof Clock; className: string }> = {
  planned: {
    label: 'Planned',
    icon: Circle,
    className: 'bg-amber-950 text-amber-400 border-amber-800',
  },
  active: {
    label: 'Active',
    icon: Clock,
    className: 'bg-blue-950 text-blue-400 border-blue-800',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-emerald-950 text-emerald-400 border-emerald-800',
  },
  archived: {
    label: 'Archived',
    icon: Archive,
    className: 'bg-[var(--color-surface-muted)] text-slate-300 border-[var(--color-border-subtle)]',
  },
};

const ProjectsPage = () => {
  const navigate = useNavigate();
  const walletAddress = useAppSelector((state) => state.auth.address ?? '');
  const { data, isLoading, error } = useGetProjectsQuery(walletAddress);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl bg-[var(--color-surface)] p-5 shadow-sm">
            <div className="mb-3 h-5 w-1/2 rounded bg-[var(--color-surface-muted)]" />
            <div className="h-4 w-full rounded bg-[var(--color-surface-muted)]" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-400" />
        <p className="text-red-400">Failed to load projects.</p>
      </div>
    );
  }

  const projects = data?.projects ?? [];
  const completeness = data?.completeness ?? 'unavailable';

  if (projects.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] p-8 text-center shadow-sm">
        <p className="text-[var(--color-text-muted)]">
          No projects have been added yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          Community Projects
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Overview of all community projects
        </p>
      </div>

      {completeness === 'incomplete' && (
        <div className="rounded-lg border border-amber-800 bg-amber-950 px-4 py-2 text-sm text-amber-400">
          <AlertTriangle className="mr-1.5 inline h-4 w-4" />
          Some projects may not be fully loaded — results are incomplete.
        </div>
      )}

      {projects.map((project) => {
        const status = STATUS_CONFIG[project.status];
        const StatusIcon = status.icon;

        return (
          <div
            key={project.id}
            onClick={() => navigate(`/project/${project.id}`)}
            className="cursor-pointer rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm transition hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {project.imageRef && (
                  <QdnImage
                    imageRef={project.imageRef}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg border border-[var(--color-border-subtle)] object-cover"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                    {project.title}
                  </h2>
                  {project.category && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-400">
                      <FolderKanban className="h-3 w-3" />
                      {project.category}
                    </p>
                  )}
                </div>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.className}`}
              >
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </span>
            </div>

            <p className="mb-3 line-clamp-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {toPlainTextPreview(project.description)}
            </p>

            {project.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs text-slate-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {project.donationAddress && (
              <div className="mb-2 text-xs text-[var(--color-text-muted)]">
                {project.fundingGoal
                  ? `Funding goal: ${project.fundingGoal.toLocaleString()} QORT`
                  : 'Has donation address'}
              </div>
            )}

            <p className="text-xs text-[var(--color-text-muted)]">
              Project lead:{' '}
              <span className="font-medium text-[var(--color-text-secondary)]">
                {project.ownerName}
              </span>
              {' · '}
              Created:{' '}
              {project.createdAt
                ? new Date(project.createdAt).toLocaleDateString('en-US')
                : '—'}
              {project.editedAt && (
                <>
                  {' · '}
                  Updated: {new Date(project.editedAt).toLocaleDateString('en-US')}
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default ProjectsPage;
