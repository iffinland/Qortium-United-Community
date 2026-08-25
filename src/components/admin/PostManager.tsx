// ===== Admin Post Manager =====
//
// Self-contained Post management section: create, list, edit, and the canonical
// owner-tombstone delete lifecycle. Only rendered from the role-gated Admin page.

import { useState, type FormEvent } from 'react';
import { FilePenLine, CheckCircle2, Edit3, Trash2 } from 'lucide-react';
import {
  usePublishPostMutation,
  useGetPostsQuery,
  useDeletePostMutation,
} from '../../store/api/qortiumApi';
import { useAppSelector } from '../../store';
import { RichTextEditor } from '../editor/RichTextEditor';
import { AdminSection } from './AdminSection';

const PostManager = () => {
  const { name, address } = useAppSelector((state) => state.auth);
  const [publishPost, { isLoading: isPublishing }] = usePublishPostMutation();
  const [deletePost] = useDeletePostMutation();
  const { data: existingPosts } = useGetPostsQuery();

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postPinned, setPostPinned] = useState(false);

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handlePublishPost = async (e: FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim() || !postContent.trim()) return;
    if (!name || !address) {
      showFeedback('error', 'Publisher identity not available. Please reload and try again.');
      return;
    }

    try {
      await publishPost({
        entityId: `p${Date.now()}`,
        title: postTitle.trim(),
        content: postContent.trim(),
        summary: postContent.trim().slice(0, 200),
        ownerName: name,
        ownerAddress: address,
      }).unwrap();

      showFeedback('success', 'Post published successfully!');
      setPostTitle('');
      setPostContent('');
      setPostPinned(false);
    } catch (err) {
      console.error('Failed to publish post:', err);
      showFeedback('error', 'Failed to publish post.');
    }
  };

  const startEditing = (post: NonNullable<typeof existingPosts>[number]) => {
    setEditingPostId(post.id);
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditTags((post.tags ?? []).join(', '));
  };

  const cancelEditing = () => {
    setEditingPostId(null);
    setEditTitle('');
    setEditContent('');
    setEditTags('');
  };

  const handleDelete = async (post: NonNullable<typeof existingPosts>[number]) => {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      await deletePost({
        postId: post.id,
        ownerName: post.authorName,
        ownerAddress: post.authorAddress,
      }).unwrap();
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
      if (!name || !address) {
        showFeedback('error', 'Publisher identity not available. Please reload and try again.');
        return;
      }

      const original = existingPosts?.find((p) => p.id === editingPostId);
      if (!original) {
        showFeedback('error', 'Original post no longer available.');
        return;
      }
      if (original.createdAtMs === null || original.createdAtMs === undefined) {
        showFeedback('error', 'Cannot update post: authoritative creation time is unavailable.');
        return;
      }

      await publishPost({
        entityId: editingPostId,
        title: editTitle.trim(),
        content: editContent.trim(),
        summary: editContent.trim().slice(0, 200),
        tags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
        coverMediaEntityId: original.coverMediaEntityId,
        ownerName: name,
        ownerAddress: address,
        createdAt: original.createdAtMs,
      }).unwrap();

      showFeedback('success', 'Post updated successfully!');
      cancelEditing();
    } catch (err) {
      console.error('Failed to update post:', err);
      showFeedback('error', 'Failed to update post.');
    }
  };

  return (
    <AdminSection
      title="Posts"
      description="Create, edit, and manage community posts."
    >
      {feedback && (
        <div
          className={`rounded-lg p-4 text-sm font-medium ${
            feedback.type === 'success'
              ? 'border border-emerald-800 bg-emerald-950 text-emerald-400'
              : 'border border-red-800 bg-red-950 text-red-400'
          }`}
        >
          {feedback.type === 'success' && <CheckCircle2 className="mr-1.5 inline h-4 w-4" />}
          {feedback.message}
        </div>
      )}

      <form
        onSubmit={handlePublishPost}
        className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm"
      >
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <FilePenLine className="h-4 w-4 text-cyan-500" />
          Create a New Post
        </h3>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">
            Title
          </label>
          <input
            type="text"
            value={postTitle}
            onChange={(e) => setPostTitle(e.target.value)}
            placeholder="Enter post title..."
            className="w-full rounded-lg border border-[var(--color-border-subtle)] p-2.5 text-sm transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            required
          />
        </div>

        <div className="mb-4">
          <RichTextEditor
            value={postContent}
            onChange={setPostContent}
            ownerName={name || ''}
            placeholder="Write your post content..."
            label="Content"
            minRows={8}
          />
        </div>

        <div className="mb-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="postPinned"
            checked={postPinned}
            onChange={(e) => setPostPinned(e.target.checked)}
            className="h-4 w-4 rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
          />
          <label htmlFor="postPinned" className="text-sm text-[var(--color-text-secondary)]">
            Pin this post to the top
          </label>
        </div>

        <button
          type="submit"
          disabled={isPublishing || !postTitle.trim() || !postContent.trim()}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPublishing ? 'Publishing...' : 'Publish Post'}
        </button>
      </form>

      <div className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <Edit3 className="h-4 w-4 text-cyan-500" />
          Existing Posts
        </h3>

        {!existingPosts || existingPosts.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No posts to manage.</p>
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
                      ownerName={name || ''}
                      minRows={4}
                      placeholder="Edit content..."
                    />
                    <input
                      type="text"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="Tags (comma separated)"
                      className="w-full rounded-lg border border-[var(--color-border-subtle)] p-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isPublishing}
                        className="rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                      >
                        {isPublishing ? 'Saving...' : 'Save'}
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
                        {post.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {post.authorName}
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
                      className="shrink-0 rounded-lg border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-muted)] transition hover:border-red-700 hover:text-red-400"
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
    </AdminSection>
  );
};

export default PostManager;
