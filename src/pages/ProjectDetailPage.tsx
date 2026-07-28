// ===== Project Detail Page – Canonical QDN Architecture =====
//
// Displays a single qucp-project resource with full details.
// Canonical owner can edit the project (forward lifecycle transitions only).
// Shows funding metadata, external links, tags, and timestamps.

import { useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, CheckCircle2, Circle, Archive, ArrowLeft, Edit3, AlertTriangle, ExternalLink, GitBranch } from 'lucide-react';
import {
  useGetProjectQuery,
  useUpdateProjectMutation,
} from '../store/api/projectApi';
import { useAppSelector } from '../store';
import { PROJECT_STATUS_VALUES, type ProjectStatus } from '../services/qdn/schemas/projectSchema';

const STATUS_CONFIG: Record<ProjectStatus, { label: string; icon: typeof Clock; className: string }> = {
  planned: { label: 'Planned', icon: Circle, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  active: { label: 'Active', icon: Clock, className: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  archived: { label: 'Archived', icon: Archive, className: 'bg-slate-50 text-slate-700 border-slate-200' },
};

const FORWARD_STATUSES: Record<ProjectStatus, ProjectStatus[]> = {
  planned: ['planned', 'active', 'completed', 'archived'],
  active: ['active', 'completed', 'archived'],
  completed: ['completed', 'archived'],
  archived: ['archived'],
};

const ProjectDetailPage = () => {
  const { entityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();
  const walletAddress = useAppSelector((state) => state.auth.address ?? '');
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const ownerName = useAppSelector((state) => state.auth.name ?? '');

  const { data: project, isLoading, error } = useGetProjectQuery(
    { entityId: entityId ?? '', currentWallet: walletAddress },
    { skip: !entityId },
  );
  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<ProjectStatus>('planned');
  const [editTags, setEditTags] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editRepository, setEditRepository] = useState('');
  const [editFeedback, setEditFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const startEditing = () => {
    if (!project) return;
    setEditTitle(project.title);
    setEditDescription(project.description);
    setEditStatus(project.status);
    setEditTags(project.tags.join(', '));
    setEditWebsite(project.website ?? '');
    setEditRepository(project.repository ?? '');
    setIsEditing(true);
    setEditFeedback(null);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditFeedback(null);
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!project || !editTitle.trim() || !editDescription.trim()) return;

    const tagList = editTags.split(',').map((t) => t.trim()).filter(Boolean);

    try {
      await updateProject({
        entityId: project.id,
        title: editTitle.trim(),
        description: editDescription.trim(),
        status: editStatus,
        tags: tagList.length > 0 ? tagList : undefined,
        imageEntityId: project.imageEntityId,
        website: editWebsite.trim() || undefined,
        repository: editRepository.trim() || undefined,
        ownerName,
        ownerAddress: walletAddress,
        existingDonationAddress: project.donationAddress,
        existingFundingGoal: project.fundingGoal,
        existingCreatedAt: project.createdAt ? new Date(project.createdAt).getTime() : Date.now(),
      }).unwrap();

      setEditFeedback({ type: 'success', message: 'Project updated!' });
      setTimeout(() => {
        setIsEditing(false);
        setEditFeedback(null);
      }, 1500);
    } catch (err) {
      console.error('Failed to update project:', err);
      setEditFeedback({ type: 'error', message: 'Failed to update project.' });
    }
  };

  // ---- Render: Loading ----
  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-3 h-6 w-1/3 rounded bg-slate-200" />
        <div className="mb-2 h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-2/3 rounded bg-slate-100" />
      </div>
    );
  }

  // ---- Render: Error ----
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-400" />
        <p className="text-red-700">Failed to load project.</p>
        <button
          onClick={() => navigate('/projects')}
          className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </button>
      </div>
    );
  }

  // ---- Render: Not Found ----
  if (!project) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">
        <p className="text-[var(--color-text-muted)]">Project not found.</p>
        <button
          onClick={() => navigate('/projects')}
          className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[project.status];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Back link */}
      <button
        onClick={() => navigate('/projects')}
        className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-indigo-600"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Projects
      </button>

      {/* Project detail card */}
      <div className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        {!isEditing ? (
          <>
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
                {project.title}
              </h1>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}
              >
                <StatusIcon className="h-3 w-3" />
                {statusCfg.label}
              </span>
            </div>

            {/* Tags */}
            {project.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
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

            {/* Description */}
            <div className="mb-4 text-sm leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap">
              {project.description}
            </div>

            {/* External links */}
            <div className="mb-4 flex flex-wrap gap-3">
              {project.website && (
                <a
                  href={project.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Website
                </a>
              )}
              {project.repository && (
                <a
                  href={project.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <GitBranch className="h-3.5 w-3.5" /> Repository
                </a>
              )}
            </div>

            {/* Funding info */}
            {project.donationAddress && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                Project donation address:{' '}
                <span className="font-mono text-xs">
                  {project.donationAddress.slice(0, 8)}...{project.donationAddress.slice(-6)}
                </span>
                {project.fundingGoal && (
                  <span className="ml-3">
                    · Funding goal: {project.fundingGoal.toLocaleString()} QORT
                  </span>
                )}
              </div>
            )}

            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-[var(--color-text-muted)]">
              <span>
                Lead: <span className="font-medium text-[var(--color-text-secondary)]">{project.ownerName}</span>
              </span>
              <span>
                Created: {project.createdAt ? new Date(project.createdAt).toLocaleDateString('en-US') : '—'}
              </span>
              {project.editedAt && (
                <span>
                  Updated: {new Date(project.editedAt).toLocaleDateString('en-US')}
                </span>
              )}
            </div>

            {/* Owner-only edit button */}
            {isAuthenticated && project.isOwner && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <button
                  onClick={startEditing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit Project
                </button>
              </div>
            )}
          </>
        ) : (
          /* ---- Edit Form ---- */
          <form onSubmit={handleUpdate} className="space-y-4">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Edit Project</h2>

            {editFeedback && (
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  editFeedback.type === 'success'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {editFeedback.message}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Title *</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Description *</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                maxLength={5000}
                required
                rows={5}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ProjectStatus)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                >
                  {(FORWARD_STATUSES[project.status] ?? PROJECT_STATUS_VALUES).map((s) => (
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
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Website</label>
                <input
                  type="url"
                  value={editWebsite}
                  onChange={(e) => setEditWebsite(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Repository</label>
                <input
                  type="url"
                  value={editRepository}
                  onChange={(e) => setEditRepository(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="https://github.com/..."
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isUpdating}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ProjectDetailPage;
