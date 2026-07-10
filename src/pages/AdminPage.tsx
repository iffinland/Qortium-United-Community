// ===== Admin Page – Content Management =====
//
// Only accessible to users with Admin+ roles.
// Allows publishing posts, polls, and projects to QDN.
// SysOp-exclusive: Manage community roles.

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePenLine, BarChart3, FolderKanban, Shield, CheckCircle2, Edit3, ShieldCheck, Trash2 } from 'lucide-react';
import { usePublishResourceMutation, useGetPostsQuery, useGetRoleRegistryQuery, useUpdateRoleRegistryMutation, useDeletePostMutation } from '../store/api/qortiumApi';
import { useAppSelector } from '../store';
import { createNotification } from '../services/qortium/notificationService';
import RichTextEditor from '../components/forum/RichTextEditor';
import ImagePicker from '../components/common/ImagePicker';
import RoleManager from '../components/admin/RoleManager';

type TabType = 'post' | 'poll' | 'project' | 'roles';

const ADMIN_ROLES = new Set(['SysOp', 'SuperAdmin', 'Admin']);
const SYSOP_ONLY = 'SysOp';

const AdminPage = () => {
  const navigate = useNavigate();
  const { role, isAuthenticated } = useAppSelector((state) => state.auth);
  const [publishResource, { isLoading: isPublishing }] =
    usePublishResourceMutation();
  const [deletePost] = useDeletePostMutation();
  const [activeTab, setActiveTab] = useState<TabType>('post');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Role management
  const { data: roleRegistry } = useGetRoleRegistryQuery();
  const [updateRoleRegistry, { isLoading: isSavingRoles }] = useUpdateRoleRegistryMutation();
  const isSysOp = role === SYSOP_ONLY;

  // Post form state
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postPinned, setPostPinned] = useState(false);
  const [postImageUrl, setPostImageUrl] = useState('');

  // Poll form state
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollClosesAt, setPollClosesAt] = useState('');

  // Project form state
  const [projTitle, setProjTitle] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projStatus, setProjStatus] =
    useState<'active' | 'planned' | 'completed'>('planned');
  const [projLead, setProjLead] = useState('');
  const [projProgress, setProjProgress] = useState(0);
  const [projImageUrl, setProjImageUrl] = useState('');

  // Edit existing posts
  const { data: existingPosts } = useGetPostsQuery();
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editTags, setEditTags] = useState('');

  const startEditing = (post: NonNullable<typeof existingPosts>[number]) => {
    setEditingPostId(post.id);
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditImageUrl(post.imageUrl || '');
    setEditTags((post.tags ?? []).join(', '));
  };

  const cancelEditing = () => {
    setEditingPostId(null);
    setEditTitle('');
    setEditContent('');
    setEditImageUrl('');
    setEditTags('');
  };

  const handleDelete = async (post: NonNullable<typeof existingPosts>[number]) => {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      await deletePost({ postId: post.id, currentData: post as unknown as Record<string, unknown> }).unwrap();
      showFeedback('success', 'Post deleted.');
    } catch (err) {
      console.error('Failed to delete post:', err);
      showFeedback('error', 'Failed to delete post.');
    }
  };

  const handleUpdatePost = async (e: FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || !editContent.trim() || !editingPostId) return;

    try {
      await publishResource({
        service: 'DOCUMENT',
        identifier: `post-${editingPostId}`,
        title: `Post: ${editTitle.trim()}`,
        description: editContent.trim().slice(0, 200),
        data: {
          id: editingPostId,
          title: editTitle.trim(),
          content: editContent.trim(),
          imageUrl: editImageUrl.trim() || undefined,
          tags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
          updatedAt: new Date().toISOString(),
        },
        filename: `${editingPostId}.json`,
      }).unwrap();

      showFeedback('success', 'Post updated successfully!');
      cancelEditing();
    } catch (err) {
      console.error('Failed to update post:', err);
      showFeedback('error', 'Failed to update post.');
    }
  };

  if (!isAuthenticated || !ADMIN_ROLES.has(role)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        <Shield className="mx-auto mb-3 h-12 w-12 text-amber-400" />
        <h1 className="mb-2 text-xl font-bold text-amber-800">
          Admin Access Required
        </h1>
        <p className="mb-4 text-sm text-amber-700">
          You need Admin, SuperAdmin, or SysOp role to access this page.
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

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handlePublishPost = async (e: FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim() || !postContent.trim()) return;

    const postId = `post-${Date.now()}`;
    const postData = {
      id: postId,
      title: postTitle.trim(),
      content: postContent.trim(),
      authorName: 'Admin',
      authorAddress: '',
      createdAt: new Date().toISOString(),
      commentsCount: 0,
      likesCount: 0,
      isPinned: postPinned,
      imageUrl: postImageUrl.trim() || undefined,
      status: 'active' as const,
    };

    try {
      await publishResource({
        service: 'DOCUMENT',
        identifier: `post-${postId}`,
        title: `Post: ${postTitle.trim()}`,
        description: postContent.trim().slice(0, 200),
        data: postData,
        filename: `${postId}.json`,
      }).unwrap();

      showFeedback('success', 'Post published successfully!');
      createNotification({ type: 'new_post', text: `New post: ${postTitle.trim()}`, link: `/post/${postId}` });
      setPostTitle('');
      setPostContent('');
      setPostPinned(false);
      setPostImageUrl('');
    } catch (err) {
      console.error('Failed to publish post:', err);
      showFeedback('error', 'Failed to publish post.');
    }
  };

  const handlePublishPoll = async (e: FormEvent) => {
    e.preventDefault();
    const validOptions = pollOptions.filter((o) => o.trim());
    if (!pollQuestion.trim() || validOptions.length < 2) return;

    const pollId = `poll-${Date.now()}`;
    const pollData = {
      id: pollId,
      question: pollQuestion.trim(),
      options: validOptions.map((label, i) => ({
        id: `opt-${i + 1}`,
        label: label.trim(),
        voteCount: 0,
      })),
      totalVotes: 0,
      closesAt: pollClosesAt ? new Date(pollClosesAt).toISOString() : null,
      createdBy: 'Admin',
      createdAt: new Date().toISOString(),
    };

    try {
      await publishResource({
        service: 'DOCUMENT',
        identifier: `poll-${pollId}`,
        title: `Poll: ${pollQuestion.trim()}`,
        description: pollQuestion.trim(),
        data: pollData,
        filename: `${pollId}.json`,
      }).unwrap();

      showFeedback('success', 'Poll published successfully!');
      createNotification({ type: 'new_poll', text: `New poll: ${pollQuestion.trim()}`, link: '/polls' });
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollClosesAt('');
    } catch (err) {
      console.error('Failed to publish poll:', err);
      showFeedback('error', 'Failed to publish poll.');
    }
  };

  const handlePublishProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!projTitle.trim() || !projDesc.trim()) return;

    const projId = `proj-${Date.now()}`;
    const projData = {
      id: projId,
      title: projTitle.trim(),
      description: projDesc.trim(),
      status: projStatus,
      progress: projProgress,
      leadName: projLead.trim() || 'Admin',
      imageUrl: projImageUrl.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    try {
      await publishResource({
        service: 'DOCUMENT',
        identifier: `project-${projId}`,
        title: `Project: ${projTitle.trim()}`,
        description: projDesc.trim().slice(0, 200),
        data: projData,
        filename: `${projId}.json`,
      }).unwrap();

      showFeedback('success', 'Project published successfully!');
      createNotification({ type: 'new_project', text: `New project: ${projTitle.trim()}`, link: '/projects' });
      setProjTitle('');
      setProjDesc('');
      setProjStatus('planned');
      setProjLead('');
      setProjProgress(0);
      setProjImageUrl('');
    } catch (err) {
      console.error('Failed to publish project:', err);
      showFeedback('error', 'Failed to publish project.');
    }
  };

  const addPollOption = () => setPollOptions([...pollOptions, '']);
  const removePollOption = (index: number) => {
    if (pollOptions.length <= 2) return;
    setPollOptions(pollOptions.filter((_, i) => i !== index));
  };

  const tabs: { key: TabType; label: string; icon: typeof FilePenLine }[] = [
    { key: 'post', label: 'New Post', icon: FilePenLine },
    { key: 'poll', label: 'New Poll', icon: BarChart3 },
    { key: 'project', label: 'New Project', icon: FolderKanban },
    ...(isSysOp ? [{ key: 'roles' as TabType, label: 'Manage Roles', icon: ShieldCheck }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          Admin Panel
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Publish content to the community
        </p>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`rounded-lg p-4 text-sm font-medium ${
            feedback.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.type === 'success' && (
            <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Post Form */}
      {activeTab === 'post' && (
        <form
          onSubmit={handlePublishPost}
          className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold">Create a New Post</h2>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">
              Title
            </label>
            <input
              type="text"
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
              placeholder="Enter post title..."
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              required
            />
          </div>

          <div className="mb-4">
            <RichTextEditor
              value={postContent}
              onChange={setPostContent}
              placeholder="Write your post content using Markdown..."
              label="Content"
              minRows={8}
            />
          </div>

          <div className="mb-4">
            <ImagePicker
              value={null}
              onChange={(src) => {
                if (!src) { setPostImageUrl(''); return; }
                setPostImageUrl(src.type === 'file' ? src.preview : `qdn://${src.service}/${src.name}/${src.identifier}`);
              }}
              label="Cover Image (optional)"
            />
          </div>

          <div className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="postPinned"
              checked={postPinned}
              onChange={(e) => setPostPinned(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
            />
            <label
              htmlFor="postPinned"
              className="text-sm text-[var(--color-text-secondary)]"
            >
              Pin this post to the top
            </label>
          </div>

          <button
            type="submit"
            disabled={isPublishing || !postTitle.trim() || !postContent.trim()}
            className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPublishing ? 'Publishing...' : 'Publish Post'}
          </button>
        </form>
      )}

      {/* Poll Form */}
      {activeTab === 'poll' && (
        <form
          onSubmit={handlePublishPoll}
          className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold">Create a New Poll</h2>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">
              Question
            </label>
            <input
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="What would you like to ask?"
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              required
            />
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
              Options
            </label>
            <div className="space-y-2">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const next = [...pollOptions];
                      next[i] = e.target.value;
                      setPollOptions(next);
                    }}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 rounded-lg border border-slate-200 p-2.5 text-sm transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    required
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removePollOption(i)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addPollOption}
              className="mt-2 text-xs font-medium text-cyan-600 hover:text-cyan-800"
            >
              + Add option
            </button>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">
              End date (optional)
            </label>
            <input
              type="datetime-local"
              value={pollClosesAt}
              onChange={(e) => setPollClosesAt(e.target.value)}
              className="rounded-lg border border-slate-200 p-2.5 text-sm transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={
              isPublishing ||
              !pollQuestion.trim() ||
              pollOptions.filter((o) => o.trim()).length < 2
            }
            className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPublishing ? 'Publishing...' : 'Publish Poll'}
          </button>
        </form>
      )}

      {/* Project Form */}
      {activeTab === 'project' && (
        <form
          onSubmit={handlePublishProject}
          className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold">Create a New Project</h2>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">
              Project Title
            </label>
            <input
              type="text"
              value={projTitle}
              onChange={(e) => setProjTitle(e.target.value)}
              placeholder="Enter project name..."
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              required
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">
              Description
            </label>
            <textarea
              value={projDesc}
              onChange={(e) => setProjDesc(e.target.value)}
              placeholder="Describe the project..."
              rows={4}
              className="w-full resize-y rounded-lg border border-slate-200 p-2.5 text-sm transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              required
            />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">
                Status
              </label>
              <select
                value={projStatus}
                onChange={(e) =>
                  setProjStatus(
                    e.target.value as 'active' | 'planned' | 'completed'
                  )
                }
                className="w-full rounded-lg border border-slate-200 p-2.5 text-sm transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              >
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">
                Progress (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={projProgress}
                onChange={(e) =>
                  setProjProgress(Math.min(100, Math.max(0, Number(e.target.value))))
                }
                className="w-full rounded-lg border border-slate-200 p-2.5 text-sm transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
            </div>
          </div>

          <div className="mb-4">
            <ImagePicker
              value={null}
              onChange={(src) => {
                if (!src) { setProjImageUrl(''); return; }
                setProjImageUrl(src.type === 'file' ? src.preview : `qdn://${src.service}/${src.name}/${src.identifier}`);
              }}
              label="Project Image (optional)"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">
              Project Lead
            </label>
            <input
              type="text"
              value={projLead}
              onChange={(e) => setProjLead(e.target.value)}
              placeholder="Name of the project lead..."
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={isPublishing || !projTitle.trim() || !projDesc.trim()}
            className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPublishing ? 'Publishing...' : 'Publish Project'}
          </button>
        </form>
      )}

      {/* Role Management (SysOp Only) */}
      {activeTab === 'roles' && isSysOp && (
        <RoleManager
          registry={roleRegistry ?? null}
          onSave={async (r) => {
            console.log('[AdminPage] Saving role registry:', r);
            try {
              await updateRoleRegistry(r).unwrap();
              showFeedback('success', 'Roles updated successfully!');
            } catch (err) {
              console.error('Failed to update roles:', err);
              showFeedback('error', 'Failed to update roles.');
              throw err;
            }
          }}
          isSaving={isSavingRoles}
        />
      )}

      {/* Manage Existing Posts */}
      <div className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Edit3 className="h-5 w-5 text-cyan-500" />
          Manage Posts
        </h2>

        {!existingPosts || existingPosts.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No posts to manage.
          </p>
        ) : (
          <div className="space-y-3">
            {existingPosts.map((post) => (
              <div
                key={post.id}
                className="rounded-lg border border-[var(--color-border-subtle)] p-4"
              >
                {editingPostId === post.id ? (
                  <form onSubmit={handleUpdatePost} className="space-y-3">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-lg border border-[var(--color-border-subtle)] p-2 text-sm"
                      required
                    />
                    <RichTextEditor
                      value={editContent}
                      onChange={setEditContent}
                      minRows={4}
                      placeholder="Edit content..."
                    />
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <ImagePicker
                          value={null}
                          onChange={(src) => {
                            if (!src) { setEditImageUrl(''); return; }
                            setEditImageUrl(src.type === 'file' ? src.preview : `qdn://${src.service}/${src.name}/${src.identifier}`);
                          }}
                          label="Cover Image (optional)"
                        />
                      </div>
                      <input
                        type="text"
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        placeholder="Tags (comma separated)"
                        className="flex-1 rounded-lg border border-[var(--color-border-subtle)] p-2 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isPublishing}
                        className="rounded-lg bg-cyan-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-50"
                      >
                        {isPublishing ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="rounded-lg border border-[var(--color-border-subtle)] px-4 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                        {post.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {post.authorName} · {post.commentsCount} comments · {post.likesCount} likes
                        {post.tags && post.tags.length > 0 && ` · ${post.tags.map((t) => `#${t}`).join(' ')}`}
                      </p>
                    </div>
                    <button
                      onClick={() => startEditing(post)}
                      className="shrink-0 rounded-lg border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-muted)] transition hover:border-cyan-300 hover:text-cyan-600"
                      title="Edit post"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(post)}
                      className="shrink-0 rounded-lg border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-muted)] transition hover:border-red-300 hover:text-red-600"
                      title="Delete post"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
