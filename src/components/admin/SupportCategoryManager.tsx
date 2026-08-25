// ===== Support Category Manager =====
// Admin UI for managing support ticket categories.

import { useState, type FormEvent } from 'react';
import { Plus, Archive, RotateCcw, Edit3, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useGetCategoriesQuery, useCreateCategoryMutation, useUpdateCategoryMutation } from '../../store/api/supportApi';
import { useAppSelector } from '../../store';

const SupportCategoryManager = () => {
  const { data: catResult, isLoading, error } = useGetCategoriesQuery();
  const [createCategory, { isLoading: isCreating }] = useCreateCategoryMutation();
  const [updateCategory, { isLoading: isUpdating }] = useUpdateCategoryMutation();
  const { name, address } = useAppSelector(s => s.auth);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catSort, setCatSort] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const categories = catResult?.categories ?? [];
  const completeness = catResult?.completeness;
  const activeCategories = categories.filter(c => c.isActive);
  const archivedCategories = categories.filter(c => !c.isActive);

  const resetForm = () => { setCatName(''); setCatDesc(''); setCatSort(''); setEditId(null); setShowForm(false); };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    const sortOrder = catSort ? parseInt(catSort, 10) : undefined;
    try {
      if (editId) {
        const existing = categories.find(c => c.id === editId);
        await updateCategory({ id: editId, name: catName.trim(), description: catDesc.trim() || undefined, isActive: existing?.isActive ?? true, sortOrder, ownerName: name || 'Admin', ownerAddress: address || '' }).unwrap();
      } else {
        await createCategory({ name: catName.trim(), description: catDesc.trim() || undefined, sortOrder, ownerName: name || 'Admin', ownerAddress: address || '' }).unwrap();
      }
      setFeedback({ type: 'success', message: editId ? 'Category updated.' : 'Category created.' });
      resetForm();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save category.' });
    }
  };

  const startEdit = (c: typeof categories[0]) => { setEditId(c.id); setCatName(c.name); setCatDesc(c.description ?? ''); setCatSort(c.sortOrder?.toString() ?? ''); setShowForm(true); };

  const toggleActive = async (c: typeof categories[0]) => {
    try {
      await updateCategory({ id: c.id, name: c.name, description: c.description, isActive: !c.isActive, sortOrder: c.sortOrder, ownerName: name || 'Admin', ownerAddress: address || '' }).unwrap();
      setFeedback({ type: 'success', message: c.isActive ? 'Category archived.' : 'Category reactivated.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update category.' });
    }
  };

  if (isLoading) return <div className="animate-pulse space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 rounded bg-[var(--color-surface-muted)]" />)}</div>;

  // Unavailable state
  if (error && completeness === undefined && categories.length === 0) {
    return (
      <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-400">
        Unable to load support categories. The QDN category data may be temporarily unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Support Categories</h2>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="flex items-center gap-1 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"><Plus className="h-3.5 w-3.5" /> New Category</button>
      </div>

      {feedback && (
        <div className={`flex items-center gap-2 rounded border p-2 text-xs ${feedback.type === 'success' ? 'border-emerald-800 bg-emerald-950 text-emerald-400' : 'border-red-800 bg-red-950 text-red-400'}`}>
          {feedback.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {feedback.message}
        </div>
      )}

      {completeness === 'incomplete' && <div className="rounded border border-amber-800 bg-amber-950 p-2 text-xs text-amber-300">Categories may be incomplete — some resources could not be validated.</div>}
      {completeness === 'unavailable' && <div className="rounded border border-red-800 bg-red-950 p-2 text-xs text-red-400">Category data is unavailable. Existing categories may not appear.</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4">
          <div className="mb-2 flex gap-2">
            <input type="text" value={catName} onChange={e => setCatName(e.target.value)} placeholder="Category name" className="flex-1 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] px-2.5 py-1.5 text-sm" required />
            <input type="number" value={catSort} onChange={e => setCatSort(e.target.value)} placeholder="Sort" className="w-16 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] px-2 py-1.5 text-sm" />
          </div>
          <input type="text" value={catDesc} onChange={e => setCatDesc(e.target.value)} placeholder="Description (optional)" className="mb-2 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] px-2.5 py-1.5 text-sm" />
          <div className="flex gap-2">
            <button type="submit" disabled={isCreating || isUpdating || !catName.trim()} className="rounded bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50">{editId ? 'Update' : 'Create'}</button>
            <button type="button" onClick={resetForm} className="rounded border px-3 py-1 text-xs">Cancel</button>
          </div>
        </form>
      )}

      {/* Active categories */}
      <div className="space-y-1">
        {activeCategories.map(c => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-3 py-2">
            <div><span className="text-sm font-medium">{c.name}</span>{c.description && <span className="ml-2 text-xs text-[var(--color-text-muted)]">{c.description}</span>}</div>
            <div className="flex items-center gap-1">
              <button onClick={() => startEdit(c)} className="rounded p-1 text-xs text-[var(--color-text-muted)] hover:text-cyan-600"><Edit3 className="h-3 w-3" /></button>
              <button onClick={() => toggleActive(c)} className="rounded p-1 text-xs text-[var(--color-text-muted)] hover:text-amber-400"><Archive className="h-3 w-3" /></button>
            </div>
          </div>
        ))}
      </div>

      {/* Archived categories */}
      {archivedCategories.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--color-text-muted)]">Archived</p>
          {archivedCategories.map(c => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-700 bg-[var(--color-surface)] px-3 py-2 opacity-60">
              <span className="text-sm">{c.name}</span>
              <button onClick={() => toggleActive(c)} className="rounded p-1 text-xs text-[var(--color-text-muted)] hover:text-emerald-400"><RotateCcw className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}

      {categories.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No categories configured.</p>}
    </div>
  );
};

export default SupportCategoryManager;
