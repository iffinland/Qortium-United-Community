// ===== Projects Page – Canonical QDN Architecture =====
//
// Displays all qucp-project resources with completeness diagnostics.
// Authenticated users can create new projects.
// Each project card shows: title, description, status badge, tags,
// funding info, owner, and creation date.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle2, Circle, Archive, Plus, AlertTriangle } from 'lucide-react';
import { useGetProjectsQuery, useCreateProjectMutation } from '../store/api/projectApi';
import { useAppSelector } from '../store';
import { PROJECT_STATUS_VALUES, type ProjectStatus } from '../services/qdn/schemas/projectSchema';

const STATUS_CONFIG: Record<ProjectStatus, { label: string; icon: typeof Clock; className: string }> = {
  planned: {
    label: 'Planned',
    icon: Circle,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  active: {
    label: 'Active',
    icon: Clock,
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  archived: {
    label: 'Archived',
    icon: Archive,
    className: 'bg-slate-50 text-slate-700 border-slate-200',
  },
};

const ProjectsPage = () => {
  const navigate = useNavigate();
  const walletAddress = useAppSelector((state) => state.auth.address ?? '');
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { data, isLoading, error } = useGetProjectsQuery(walletAddress);
  const [showNewForm, setShowNewForm] = useState(false);

  // ---- Render: Loading ----
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-3 h-5 w-1/2 rounded bg-slate-200" />
            <div className="h-4 w-full rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  // ---- Render: Error ----
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-400" />
        <p className="text-red-700">Failed to load projects.</p>
      </div>
    );
  }

  const projects = data?.projects ?? [];
  const completeness = data?.completeness ?? 'unavailable';

  // ---- Render: Empty ----
  if (projects.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">
        <p className="mb-4 text-[var(--color-text-muted)]">
          No projects have been added yet.
        </p>
        {isAuthenticated && (
          <button
            onClick={() => setShowNewForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        )}
        {showNewForm && <NewProjectForm onClose={() => setShowNewForm(false)} />}
      </div>
    );
  }

  // ---- Render: Project List ----
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
            Community Projects
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Overview of all community projects
          </p>
        </div>
        {isAuthenticated && (
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        )}
      </div>

      {/* Completeness banner */}
      {completeness === 'incomplete' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          <AlertTriangle className="mr-1.5 inline h-4 w-4" />
          Some projects may not be fully loaded — results are incomplete.
        </div>
      )}

      {/* New project form */}
      {showNewForm && <NewProjectForm onClose={() => setShowNewForm(false)} />}

      {/* Project cards */}
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

            <p className="mb-3 line-clamp-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {project.description}
            </p>

            {/* Tags */}
            {project.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Funding info */}
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

// ===== Inline New Project Form =====

function NewProjectForm({ onClose }: { onClose: () => void }) {
  const walletAddress = useAppSelector((state) => state.auth.address ?? '');
  const ownerName = useAppSelector((state) => state.auth.name ?? '');
  const [createProject, { isLoading }] = useCreateProjectMutation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('planned');
  const [tags, setTags] = useState('');
  const [website, setWebsite] = useState('');
  const [repository, setRepository] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    const entityId = `proj${Date.now()}`;
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);

    try {
      await createProject({
        entityId,
        title: title.trim(),
        description: description.trim(),
        status,
        tags: tagList.length > 0 ? tagList : undefined,
        website: website.trim() || undefined,
        repository: repository.trim() || undefined,
        ownerName: ownerName || 'Unknown',
        ownerAddress: walletAddress,
      }).unwrap();

      setFeedback({ type: 'success', message: 'Project created!' });
      setTimeout(() => {
        setFeedback(null);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to create project:', err);
      setFeedback({ type: 'error', message: 'Failed to create project.' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
      <h3 className="mb-3 text-sm font-semibold text-indigo-800">Create New Project</h3>

      {feedback && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            placeholder="Project title"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            required
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            placeholder="Describe the project..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              {PROJECT_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              placeholder="dev, qortal, community"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Website URL</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Repository URL</label>
            <input
              type="url"
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              placeholder="https://github.com/..."
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading ? 'Creating...' : 'Create Project'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default ProjectsPage;
