// ===== Admin Wiki Manager =====
//
// Self-contained Wiki article management section: create, list (active +
// archived), edit, and canonical archive. Authorization stays in the Wiki API
// (SysOp/Admin role + canonical publisher ownership); this UI only exposes it
// from the role-gated Admin panel.

import { useState, type FormEvent } from 'react';
import { CheckCircle2, BookOpen, Plus, Edit3, Archive } from 'lucide-react';
import {
  useGetCategoriesQuery,
  useGetWikiAdminListQuery,
  useCreateWikiArticleMutation,
  useUpdateWikiArticleMutation,
  useArchiveWikiArticleMutation,
} from '../../store/api/wikiApi';
import type { WikiArticleView } from '../../types/wiki';
import { useAppSelector } from '../../store';
import { RichTextEditor } from '../editor/RichTextEditor';
import { AdminSection } from './AdminSection';

const WikiManager = () => {
  const { name } = useAppSelector((state) => state.auth);
  const { data: categories } = useGetCategoriesQuery();
  const { data: wikiList } = useGetWikiAdminListQuery();
  const [createArticle, { isLoading: isCreating }] = useCreateWikiArticleMutation();
  const [updateArticle, { isLoading: isUpdating }] = useUpdateWikiArticleMutation();
  const [archiveArticle] = useArchiveWikiArticleMutation();

  const articles = wikiList?.articles ?? [];

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createCategoryId, setCreateCategoryId] = useState(categories?.[0]?.id ?? '');
  const [createTitle, setCreateTitle] = useState('');
  const [createContent, setCreateContent] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editFeedback, setEditFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const effectiveCreateCategoryId = createCategoryId || categories?.[0]?.id || '';

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => setFeedback(null), 5000);
  };

  const resetCreate = () => {
    setCreateCategoryId(categories?.[0]?.id ?? '');
    setCreateTitle('');
    setCreateContent('');
    setShowCreate(false);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!createTitle.trim() || !createContent.trim() || !effectiveCreateCategoryId) return;

    try {
      await createArticle({
        categoryId: effectiveCreateCategoryId,
        title: createTitle.trim(),
        content: createContent.trim(),
      }).unwrap();
      resetCreate();
      showFeedback('success', 'Wiki article created.');
    } catch (error) {
      console.error('Failed to create wiki article:', error);
      showFeedback('error', error instanceof Error ? error.message : 'Failed to create wiki article.');
    }
  };

  const startEditing = (article: WikiArticleView) => {
    setEditingId(article.entityId);
    setEditCategoryId(article.categoryId);
    setEditTitle(article.title);
    setEditContent(article.content);
    setEditFeedback(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditFeedback(null);
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId || !editTitle.trim() || !editContent.trim() || !editCategoryId) return;

    const article = articles.find((item) => item.entityId === editingId);
    if (!article) {
      setEditFeedback({ type: 'error', message: 'Article no longer available.' });
      return;
    }

    try {
      await updateArticle({
        entityId: editingId,
        expectedRevision: article.revision,
        categoryId: editCategoryId,
        title: editTitle.trim(),
        content: editContent.trim(),
      }).unwrap();
      setEditFeedback({ type: 'success', message: 'Article updated!' });
      window.setTimeout(() => {
        setEditingId(null);
        setEditFeedback(null);
      }, 1200);
    } catch (error) {
      console.error('Failed to update wiki article:', error);
      setEditFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update wiki article.' });
    }
  };

  const handleArchive = async (article: WikiArticleView) => {
    if (!window.confirm(`Archive "${article.title}"?`)) return;
    try {
      await archiveArticle({
        entityId: article.entityId,
        expectedRevision: article.revision,
      }).unwrap();
      showFeedback('success', 'Wiki article archived.');
    } catch (error) {
      console.error('Failed to archive wiki article:', error);
      showFeedback('error', error instanceof Error ? error.message : 'Failed to archive wiki article.');
    }
  };

  return (
    <AdminSection
      title="Wiki"
      description="Create, edit, and archive wiki articles."
      action={
        <button
          type="button"
          onClick={() => setShowCreate((current) => !current)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          <Plus className="h-3.5 w-3.5" /> New Article
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
            <BookOpen className="h-4 w-4 text-cyan-500" />
            Create Wiki Article
          </h3>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Category</label>
            <select
              value={effectiveCreateCategoryId}
              onChange={(event) => setCreateCategoryId(event.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-2.5 text-sm text-white"
            >
              {(categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon} {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Title</label>
            <input
              type="text"
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              placeholder="Article title..."
              required
              className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-2.5 text-sm text-white"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Content</label>
            <RichTextEditor
              value={createContent}
              onChange={setCreateContent}
              ownerName={name || ''}
              placeholder="Write the article..."
              minRows={10}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isCreating || !createTitle.trim() || !createContent.trim() || !effectiveCreateCategoryId}
              className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Article'}
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
          <BookOpen className="h-4 w-4 text-cyan-500" />
          Existing Wiki Articles
        </h3>

        {articles.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No wiki articles to manage.</p>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <div
                key={article.entityId}
                className="rounded-lg border border-[var(--color-border-subtle)] p-4"
              >
                {editingId === article.entityId ? (
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
                    <select
                      value={editCategoryId}
                      onChange={(event) => setEditCategoryId(event.target.value)}
                      className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-2.5 text-sm text-white"
                    >
                      {(categories ?? []).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.icon} {category.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      className="w-full rounded-lg border border-[var(--color-border-subtle)] p-2 text-sm"
                      required
                    />
                    <RichTextEditor
                      value={editContent}
                      onChange={setEditContent}
                      ownerName={name || ''}
                      minRows={6}
                      placeholder="Edit article content..."
                    />
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
                        {article.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {article.publisherName} · v{article.revision}
                        {article.status === 'archived' && ' · Archived'}
                      </p>
                    </div>
                    {article.status === 'active' && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditing(article)}
                          className="rounded-lg border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-muted)] transition hover:border-cyan-300 hover:text-cyan-600"
                          title="Edit article"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(article)}
                          className="rounded-lg border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-muted)] transition hover:border-red-700 hover:text-red-400"
                          title="Archive article"
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

export default WikiManager;
