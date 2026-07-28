// ===== Wiki Edit Page =====

import { useState, type FormEvent, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useGetArticleQuery, useGetCategoriesQuery, useSaveArticleMutation } from '../store/api/wikiApi';
import { useAppSelector } from '../store';
import RichTextEditor from '../components/forum/RichTextEditor';

const EDITOR_ROLES = new Set(['SysOp', 'SuperAdmin', 'Admin', 'Creator']);

const WikiEditPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isNew = !slug || slug === 'new';
  const { data: existingArticle } = useGetArticleQuery(slug || '', { skip: isNew });
  const { data: categories } = useGetCategoriesQuery();
  const [saveArticle, { isLoading: isSaving }] = useSaveArticleMutation();
  const { name, role } = useAppSelector((s) => s.auth);

  // Derive defaults from query data; user edits are tracked separately.
  // This avoids useEffect(setState) which triggers cascading re-renders.
  const articleDefaults = useMemo(
    () => ({
      title: (!isNew && existingArticle) ? existingArticle.title : '',
      content: (!isNew && existingArticle) ? existingArticle.content : '',
      categoryId: (!isNew && existingArticle) ? existingArticle.categoryId
        : (categories && categories.length > 0) ? categories[0].id : '',
    }),
    [isNew, existingArticle, categories],
  );

  const [userTitle, setUserTitle] = useState<string | null>(null);
  const [userContent, setUserContent] = useState<string | null>(null);
  const [userCategoryId, setUserCategoryId] = useState<string | null>(null);

  // Effective values: user edit if present, otherwise derived default
  const title = userTitle ?? articleDefaults.title;
  const content = userContent ?? articleDefaults.content;
  const categoryId = userCategoryId || articleDefaults.categoryId;

  if (!EDITOR_ROLES.has(role)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-800 dark:bg-amber-950">
        <p className="text-amber-700 dark:text-amber-400">You need Creator, Admin, SuperAdmin or SysOp role to edit wiki articles.</p>
        <Link to="/wiki" className="mt-2 inline-block text-sm text-cyan-600">Back to Wiki</Link>
      </div>
    );
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || isSaving) return;
    try {
      await saveArticle({
        slug: isNew ? undefined : slug,
        categoryId,
        title: title.trim(),
        content: content.trim(),
        authorName: name || 'Unknown',
      }).unwrap();
      navigate('/wiki');
    } catch { /* handled by RTK Query */ }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to={isNew ? '/wiki' : `/wiki/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <form onSubmit={handleSave} className="rounded-xl bg-[var(--color-surface-card)] p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-bold text-[var(--color-text-primary)]">
          {isNew ? 'Create Article' : 'Edit Article'}
        </h1>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Category</label>
          <select value={categoryId} onChange={(e) => setUserCategoryId(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-white p-2.5 text-sm dark:bg-slate-900 dark:text-white">
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Title</label>
          <input type="text" value={title} onChange={(e) => setUserTitle(e.target.value)}
            placeholder="Article title..." required
            className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-white p-2.5 text-sm dark:bg-slate-900 dark:text-white" />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Content (Markdown)</label>
          <RichTextEditor value={content} onChange={setUserContent} placeholder="Write the article using Markdown..." minRows={12} />
        </div>

        <button type="submit" disabled={!title.trim() || !content.trim() || isSaving}
          className="flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-50">
          <Save className="h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Article'}
        </button>
      </form>
    </div>
  );
};

export default WikiEditPage;
