// ===== Admin Page – Content Management =====
//
// Only accessible to users with Admin+ roles.
// Allows publishing posts, polls, and projects to QDN.
// SysOp-exclusive: Manage community roles.

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePenLine, FolderKanban, Shield, CheckCircle2, Edit3, ShieldCheck, Trash2 } from 'lucide-react';
import { usePublishResourceMutation, useGetPostsQuery, useGetRoleRegistryQuery, useUpdateRoleRegistryMutation, useDeletePostMutation, useRestorePostMutation } from '../store/api/qortiumApi';
import { useAppSelector } from '../store';
import RichTextEditor from '../components/forum/RichTextEditor';
import ImagePicker from '../components/common/ImagePicker';
import RoleManager from '../components/admin/RoleManager';
import SupportCategoryManager from '../components/admin/SupportCategoryManager';
import { buildQucpIdentifier } from '../services/qdn/identifiers/qucpIdentifiers';

type TabType = 'post' | 'roles' | 'support-categories';

const ADMIN_ROLES = new Set(['SysOp', 'SuperAdmin', 'Admin']);
const SYSOP_ONLY = 'SysOp';

const AdminPage = () => {
  const navigate = useNavigate();
  const { role, isAuthenticated } = useAppSelector((state) => state.auth);
  const [publishResource, { isLoading: isPublishing }] =
    usePublishResourceMutation();
  const [deletePost] = useDeletePostMutation();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_restorePost] = useRestorePostMutation();
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
  const [postCoverMediaId, setPostCoverMediaId] = useState('');

  // Edit existing posts
  const { data: existingPosts } = useGetPostsQuery();
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCoverMediaId, setEditCoverMediaId] = useState('');
  const [editTags, setEditTags] = useState('');

  const startEditing = (post: NonNullable<typeof existingPosts>[number]) => {
    setEditingPostId(post.id);
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditCoverMediaId(post.coverMediaEntityId || '');
    setEditTags((post.tags ?? []).join(', '));
  };

  const cancelEditing = () => {
    setEditingPostId(null);
    setEditTitle('');
    setEditContent('');
    setEditCoverMediaId('');
    setEditTags('');
  };

  const handleDelete = async (post: NonNullable<typeof existingPosts>[number]) => {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      await deletePost({ postId: post.id, ownerName: post.authorName, ownerAddress: post.authorAddress }).unwrap();
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
        identifier: buildQucpIdentifier('qucp-post', editingPostId),
        title: `Post: ${editTitle.trim()}`,
        description: editContent.trim().slice(0, 200),
        data: {
          id: editingPostId,
          title: editTitle.trim(),
          content: editContent.trim(),
          coverMediaEntityId: editCoverMediaId.trim() || undefined,
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

    const postEntityId = `p${Date.now()}`;
    const postId = postEntityId;
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
      coverMediaEntityId: postCoverMediaId.trim() || undefined,
      status: 'active' as const,
    };

    try {
      await publishResource({
        service: 'DOCUMENT',
        identifier: buildQucpIdentifier('qucp-post', postEntityId),
        title: `Post: ${postTitle.trim()}`,
        description: postContent.trim().slice(0, 200),
        data: postData,
        filename: `${postEntityId}.json`,
      }).unwrap();

      showFeedback('success', 'Post published successfully!');
      setPostTitle('');
      setPostContent('');
      setPostPinned(false);
      setPostCoverMediaId('');
    } catch (err) {
      console.error('Failed to publish post:', err);
      showFeedback('error', 'Failed to publish post.');
    }
  };

  const tabs: { key: TabType; label: string; icon: typeof FilePenLine }[] = [
    { key: 'post', label: 'New Post', icon: FilePenLine },
    ...(isSysOp ? [{ key: 'roles' as TabType, label: 'Manage Roles', icon: ShieldCheck }] : []),
    { key: 'support-categories' as TabType, label: 'Support Categories', icon: FolderKanban },
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
                if (!src) { setPostCoverMediaId(''); return; }
                setPostCoverMediaId(src.type === 'file' ? src.preview : `qdn://${src.service}/${src.name}/${src.identifier}`);
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

      {/* Support Categories (Admin/SysOp) */}
      {activeTab === 'support-categories' && <SupportCategoryManager />}

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
                            if (!src) { setEditCoverMediaId(''); return; }
                            setEditCoverMediaId(src.type === 'file' ? src.preview : `qdn://${src.service}/${src.name}/${src.identifier}`);
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
