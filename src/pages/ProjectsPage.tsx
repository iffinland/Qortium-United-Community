// ===== Projects Page =====

import { Clock, CheckCircle2, Circle } from 'lucide-react';
import { useGetProjectsQuery } from '../store/api/qortiumApi';

const statusConfig = {
  active: {
    label: 'Active',
    icon: Clock,
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    barColor: 'bg-blue-500',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    barColor: 'bg-emerald-500',
  },
  planned: {
    label: 'Planned',
    icon: Circle,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    barColor: 'bg-amber-500',
  },
} as const;

const ProjectsPage = () => {
  const { data: projects, isLoading, error } = useGetProjectsQuery();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl bg-white p-5 shadow-sm"
          >
            <div className="mb-3 h-5 w-1/2 rounded bg-slate-200" />
            <div className="h-4 w-full rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">Failed to load projects.</p>
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">
        <p className="text-[var(--color-text-muted)]">
          No projects have been added yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          Community Projects
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Overview of all community projects
        </p>
      </div>

      {projects.map((project) => {
        const status = statusConfig[project.status];
        const StatusIcon = status.icon;

        return (
          <div
            key={project.id}
            className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {project.title}
              </h2>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.className}`}
              >
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </span>
            </div>

            <p className="mb-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {project.description}
            </p>

            {/* Progress bar */}
            <div className="mb-2 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${status.barColor}`}
                  style={{ width: `${project.progress}%` }}
                />
              </div>
              <span className="text-sm font-medium tabular-nums text-[var(--color-text-secondary)]">
                {project.progress}%
              </span>
            </div>

            <p className="text-xs text-[var(--color-text-muted)]">
              Project lead:{' '}
              <span className="font-medium text-[var(--color-text-secondary)]">
                {project.leadName}
              </span>
              {' · '}
              Started:{' '}
              {new Date(project.createdAt).toLocaleDateString('en-US')}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default ProjectsPage;
