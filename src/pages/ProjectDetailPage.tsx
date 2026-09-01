// ===== Project Detail Page – Canonical QDN Architecture =====
//
// Displays a single qucp-project resource with full details.
// Canonical owner can edit the project (forward lifecycle transitions only).
// Shows funding metadata, external links, tags, and timestamps.

import { useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, CheckCircle2, Circle, Archive, ArrowLeft, Edit3, AlertTriangle, ExternalLink, GitBranch, FolderKanban } from 'lucide-react';
import {
  useGetProjectQuery,
  useUpdateProjectMutation,
} from '../store/api/projectApi';
import { useAppSelector } from '../store';
import { PROJECT_STATUS_VALUES, VALID_LIFECYCLE_TRANSITIONS, type ProjectStatus } from '../services/qdn/schemas/projectSchema';
import { openQdnUrl } from '../services/qortium/qdnNavigation';
import { RichTextEditor } from '../components/editor/RichTextEditor';
import { RichTextContent } from '../components/editor/RichTextContent';
import { QdnImage } from '../components/editor/QdnImage';
import { findFirstQdnImageRef } from '../services/rich-text/richText';

const STATUS_CONFIG: Record<ProjectStatus, { label: string; icon: typeof Clock; className: string }> = {
  planned: { label: 'Planned', icon: Circle, className: 'bg-amber-950 text-amber-400 border-amber-800' },
  active: { label: 'Active', icon: Clock, className: 'bg-blue-950 text-blue-400 border-blue-800' },
  completed: { label: 'Completed', icon: CheckCircle2, className: 'bg-emerald-950 text-emerald-400 border-emerald-800' },
  archived: { label: 'Archived', icon: Archive, className: 'bg-[var(--color-surface-muted)] text-slate-300 border-[var(--color-border-subtle)]' },
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
  const [editCategory, setEditCategory] = useState('');
  const [editQdnUrl, setEditQdnUrl] = useState('');
  const [editFeedback, setEditFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const startEditing = () => {
    if (!project) return;
    setEditTitle(project.title);
    setEditDescription(project.description);
    setEditStatus(project.status);
    setEditTags(project.tags.join(', '));
    setEditWebsite(project.website ?? '');
    setEditRepository(project.repository ?? '');
    setEditCategory(project.category ?? '');
    setEditQdnUrl(project.qdnUrl ?? '');
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
        category: editCategory.trim() || undefined,
        qdnUrl: editQdnUrl.trim() || undefined,
        ownerName,
        ownerAddress: walletAddress,
        existingStatus: project.status,
        existingOwnerName: project.ownerName,
        existingOwnerAddress: project.ownerAddress,
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

  const handleOpenQdnUrl = async () => {
    if (!project?.qdnUrl) return;
    try {
      await openQdnUrl(project.qdnUrl);
    } catch (err) {
      console.error('Failed to open QDN URL:', err);
      window.alert(err instanceof Error ? err.message : 'Failed to open QDN URL.');
    }
  };

  // ---- Render: Loading ----
  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl bg-[var(--color-surface)] p-6 shadow-sm">
        <div className="mb-3 h-6 w-1/3 rounded bg-[var(--color-surface-muted)]" />
        <div className="mb-2 h-4 w-full rounded bg-[var(--color-surface-muted)]" />
        <div className="h-4 w-2/3 rounded bg-[var(--color-surface-muted)]" />
      </div>
    );
  }

  // ---- Render: Error ----
  if (error) {
    return (
      <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-400" />
        <p className="text-red-400">Failed to load project.</p>
        <button
          onClick={() => navigate('/projects')}
          className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </button>
      </div>
    );
  }

  // ---- Render: Not Found ----
  if (!project) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] p-8 text-center shadow-sm">
        <p className="text-[var(--color-text-muted)]">Project not found.</p>
        <button
          onClick={() => navigate('/projects')}
          className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[project.status];
  const StatusIcon = statusCfg.icon;
  const hasInlineImage = findFirstQdnImageRef(project.description) !== null;

  return (
    <div className="space-y-4">
      {/* Back link */}
      <button
        onClick={() => navigate('/projects')}
        className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-indigo-400"
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

            {!hasInlineImage && project.imageRef && (
              <QdnImage
                imageRef={project.imageRef}
                alt={project.title}
                className="mb-4 max-h-80 w-full rounded-lg border border-[var(--color-border-subtle)] object-cover"
                loading="eager"
              />
            )}

            {project.category && (
              <div className="mb-4 inline-flex items-center gap-1 rounded-full border border-indigo-800 bg-indigo-950 px-2.5 py-0.5 text-xs font-medium text-indigo-400">
                <FolderKanban className="h-3 w-3" />
                {project.category}
              </div>
            )}

            {/* Tags */}
            {project.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
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

            {/* Description */}
            <div className="mb-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              <RichTextContent value={project.description} />
            </div>

            {/* External links */}
            <div className="mb-4 flex flex-wrap gap-3">
              {project.qdnUrl && (
                <button
                  type="button"
                  onClick={handleOpenQdnUrl}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs font-medium text-cyan-400 transition hover:bg-slate-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> QDN Link
                </button>
              )}
              {project.website && (
                <a
                  href={project.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Website
                </a>
              )}
              {project.repository && (
                <a
                  href={project.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800"
                >
                  <GitBranch className="h-3.5 w-3.5" /> Repository
                </a>
              )}
            </div>

            {/* Funding info */}
            {project.donationAddress && (
              <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950 px-4 py-2 text-sm text-emerald-400">
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-700 pt-3 text-xs text-[var(--color-text-muted)]">
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
            {isAuthenticated && project.isOwner && project.status !== 'archived' && (
              <div className="mt-4 border-t border-slate-700 pt-3">
                <button
                  onClick={startEditing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800"
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
                    ? 'bg-emerald-950 text-emerald-400'
                    : 'bg-red-950 text-red-400'
                }`}
              >
                {editFeedback.message}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Title *</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
                required
                className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Description *</label>
              <RichTextEditor
                value={editDescription}
                ownerName={ownerName}
                onChange={setEditDescription}
                placeholder="Describe the project..."
                minRows={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ProjectStatus)}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                >
                  {(VALID_LIFECYCLE_TRANSITIONS[project.status] ?? PROJECT_STATUS_VALUES).map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Category</label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  maxLength={50}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="Infrastructure"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">QDN URL</label>
                <input
                  type="text"
                  value={editQdnUrl}
                  onChange={(e) => setEditQdnUrl(e.target.value)}
                  maxLength={500}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="qdn://DOCUMENT/Name/Identifier"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Website</label>
                <input
                  type="url"
                  value={editWebsite}
                  onChange={(e) => setEditWebsite(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Repository</label>
                <input
                  type="url"
                  value={editRepository}
                  onChange={(e) => setEditRepository(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="https://github.com/..."
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isUpdating}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800"
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
