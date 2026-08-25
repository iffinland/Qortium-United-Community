// ===== Admin Project Manager =====
//
// Complete Project management section: create, list, edit, and canonical
// lifecycle archive. Public project discovery remains read-only; this is the
// only normal product surface that creates projects.

import { useState, type FormEvent } from 'react';
import { CheckCircle2, FolderKanban, Edit3, Archive, Plus } from 'lucide-react';
import {
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useGetProjectsQuery,
  type ProjectView,
} from '../../store/api/projectApi';
import { useAppSelector } from '../../store';
import {
  VALID_LIFECYCLE_TRANSITIONS,
  type ProjectStatus,
} from '../../services/qdn/schemas/projectSchema';
import { RichTextEditor } from '../editor/RichTextEditor';
import { AdminSection } from './AdminSection';

const CREATE_STATUSES: ProjectStatus[] = ['planned', 'active'];

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

const ProjectManager = () => {
  const { name: ownerName, address: ownerAddress } = useAppSelector((state) => state.auth);
  const walletAddress = ownerAddress ?? '';
  const { data: projectData } = useGetProjectsQuery(walletAddress);
  const [createProject, { isLoading: isCreating }] = useCreateProjectMutation();
  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation();

  const projects = projectData?.projects ?? [];

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('planned');
  const [tags, setTags] = useState('');
  const [category, setCategory] = useState('');
  const [qdnUrl, setQdnUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [repository, setRepository] = useState('');

  // Edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<ProjectStatus>('planned');
  const [editTags, setEditTags] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editQdnUrl, setEditQdnUrl] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editRepository, setEditRepository] = useState('');
  const [editFeedback, setEditFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => setFeedback(null), 5000);
  };

  const resetCreate = () => {
    setTitle('');
    setDescription('');
    setStatus('planned');
    setTags('');
    setCategory('');
    setQdnUrl('');
    setWebsite('');
    setRepository('');
    setShowCreate(false);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !description.trim()) return;
    if (!ownerName || !ownerAddress) {
      showFeedback('error', 'Publisher identity is unavailable. Reload and try again.');
      return;
    }

    const tagList = tags.split(',').map((tag) => tag.trim()).filter(Boolean);

    try {
      await createProject({
        entityId: `proj${Date.now()}`,
        title: title.trim(),
        description: description.trim(),
        status,
        tags: tagList.length > 0 ? tagList : undefined,
        category: category.trim() || undefined,
        qdnUrl: qdnUrl.trim() || undefined,
        website: website.trim() || undefined,
        repository: repository.trim() || undefined,
        ownerName,
        ownerAddress,
      }).unwrap();

      resetCreate();
      showFeedback('success', 'Project created.');
    } catch (error) {
      console.error('Failed to create project:', error);
      showFeedback('error', error instanceof Error ? error.message : 'Failed to create project.');
    }
  };

  const startEditing = (project: ProjectView) => {
    setEditingId(project.id);
    setEditTitle(project.title);
    setEditDescription(project.description);
    setEditStatus(project.status);
    setEditTags(project.tags.join(', '));
    setEditCategory(project.category ?? '');
    setEditQdnUrl(project.qdnUrl ?? '');
    setEditWebsite(project.website ?? '');
    setEditRepository(project.repository ?? '');
    setEditFeedback(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditFeedback(null);
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId || !editTitle.trim() || !editDescription.trim()) return;

    const project = projects.find((p) => p.id === editingId);
    if (!project) {
      setEditFeedback({ type: 'error', message: 'Project no longer available.' });
      return;
    }

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
        ownerName: ownerName ?? '',
        ownerAddress: walletAddress,
        existingStatus: project.status,
        existingOwnerName: project.ownerName,
        existingOwnerAddress: project.ownerAddress,
        existingDonationAddress: project.donationAddress,
        existingFundingGoal: project.fundingGoal,
        existingCreatedAt: project.createdAt ? new Date(project.createdAt).getTime() : Date.now(),
      }).unwrap();

      setEditFeedback({ type: 'success', message: 'Project updated!' });
      window.setTimeout(() => {
        setEditingId(null);
        setEditFeedback(null);
      }, 1200);
    } catch (error) {
      console.error('Failed to update project:', error);
      setEditFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update project.' });
    }
  };

  const handleArchive = async (project: ProjectView) => {
    if (!window.confirm(`Archive "${project.title}"? This is the canonical terminal lifecycle action.`)) return;
    try {
      await updateProject({
        entityId: project.id,
        title: project.title,
        description: project.description,
        status: 'archived',
        tags: project.tags.length > 0 ? project.tags : undefined,
        imageEntityId: project.imageEntityId,
        website: project.website,
        repository: project.repository,
        category: project.category,
        qdnUrl: project.qdnUrl,
        ownerName: ownerName ?? '',
        ownerAddress: walletAddress,
        existingStatus: project.status,
        existingOwnerName: project.ownerName,
        existingOwnerAddress: project.ownerAddress,
        existingDonationAddress: project.donationAddress,
        existingFundingGoal: project.fundingGoal,
        existingCreatedAt: project.createdAt ? new Date(project.createdAt).getTime() : Date.now(),
      }).unwrap();
      showFeedback('success', 'Project archived.');
    } catch (error) {
      console.error('Failed to archive project:', error);
      showFeedback('error', error instanceof Error ? error.message : 'Failed to archive project.');
    }
  };

  return (
    <AdminSection
      title="Projects"
      description="Create, edit, and archive community projects."
      action={
        <button
          type="button"
          onClick={() => setShowCreate((current) => !current)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          <Plus className="h-3.5 w-3.5" /> New Project
        </button>
      }
    >
      {feedback && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-800 bg-emerald-950 text-emerald-400'
              : 'border-red-800 bg-red-950 text-red-400'
          }`}
        >
          {feedback.type === 'success' && <CheckCircle2 className="mr-1.5 inline h-4 w-4" />}
          {feedback.message}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <FolderKanban className="h-4 w-4 text-indigo-500" />
            Create Project
          </h3>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
                className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                placeholder="Project title"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Description *</label>
              <RichTextEditor
                value={description}
                ownerName={ownerName ?? ''}
                onChange={setDescription}
                placeholder="Describe the project..."
                minRows={4}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ProjectStatus)}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                >
                  {CREATE_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABEL[value]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="dev, qortium, community"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  maxLength={50}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="Infrastructure"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">QDN URL</label>
                <input
                  type="text"
                  value={qdnUrl}
                  onChange={(event) => setQdnUrl(event.target.value)}
                  maxLength={500}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="qdn://DOCUMENT/Name/Identifier"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Website URL</label>
                <input
                  type="url"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Repository URL</label>
                <input
                  type="url"
                  value={repository}
                  onChange={(event) => setRepository(event.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="https://github.com/..."
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={isCreating || !title.trim() || !description.trim()}
              className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </button>
            <button
              type="button"
              onClick={resetCreate}
              className="rounded-lg border border-[var(--color-border-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <FolderKanban className="h-4 w-4 text-indigo-500" />
          Existing Projects
        </h3>

        {projects.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No projects to manage.</p>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="rounded-lg border border-[var(--color-border-subtle)] p-4"
              >
                {editingId === project.id ? (
                  <form onSubmit={handleUpdate} className="space-y-3">
                    {editFeedback && (
                      <div
                        className={`rounded px-3 py-2 text-xs ${
                          editFeedback.type === 'success'
                            ? 'bg-emerald-950 text-emerald-400'
                            : 'bg-red-950 text-red-400'
                        }`}
                      >
                        {editFeedback.message}
                      </div>
                    )}
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      className="w-full rounded-lg border border-[var(--color-border-subtle)] p-2 text-sm"
                      required
                    />
                    <RichTextEditor
                      value={editDescription}
                      onChange={setEditDescription}
                      ownerName={ownerName ?? ''}
                      minRows={4}
                      placeholder="Edit description..."
                    />
                    <select
                      value={editStatus}
                      onChange={(event) => setEditStatus(event.target.value as ProjectStatus)}
                      className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm"
                    >
                      {(VALID_LIFECYCLE_TRANSITIONS[project.status] ?? []).map((value) => (
                        <option key={value} value={value}>
                          {STATUS_LABEL[value]}
                        </option>
                      ))}
                    </select>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        value={editTags}
                        onChange={(event) => setEditTags(event.target.value)}
                        placeholder="Tags (comma-separated)"
                        className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={editCategory}
                        onChange={(event) => setEditCategory(event.target.value)}
                        placeholder="Category"
                        className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={editQdnUrl}
                        onChange={(event) => setEditQdnUrl(event.target.value)}
                        placeholder="QDN URL"
                        className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm"
                      />
                      <input
                        type="url"
                        value={editWebsite}
                        onChange={(event) => setEditWebsite(event.target.value)}
                        placeholder="Website"
                        className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm"
                      />
                      <input
                        type="url"
                        value={editRepository}
                        onChange={(event) => setEditRepository(event.target.value)}
                        placeholder="Repository"
                        className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isUpdating}
                        className="rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                      >
                        {isUpdating ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="rounded-lg border border-[var(--color-border-subtle)] px-4 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                        {project.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {STATUS_LABEL[project.status]} · {project.ownerName}
                      </p>
                    </div>
                    {project.isOwner && project.status !== 'archived' && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditing(project)}
                          className="rounded-lg border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-muted)] transition hover:border-cyan-300 hover:text-cyan-600"
                          title="Edit project"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(project)}
                          className="rounded-lg border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-muted)] transition hover:border-red-700 hover:text-red-400"
                          title="Archive project"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminSection>
  );
};

export default ProjectManager;
