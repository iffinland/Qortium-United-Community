// ===== Admin Event Manager =====
//
// Complete Event management section: create, list (active + archived), edit,
// and canonical lifecycle archive. Public event discovery remains read-only;
// this is the only normal product surface that creates or manages events.

import { useState, type FormEvent } from 'react';
import { Calendar, Plus, Edit3, Archive, CheckCircle2 } from 'lucide-react';
import {
  useCreateEventMutation,
  useUpdateEventMutation,
  useArchiveEventMutation,
  useGetEventsQuery,
  type EventView,
} from '../../store/api/eventApi';
import { useAppSelector } from '../../store';
import { RichTextEditor } from '../editor/RichTextEditor';
import { AdminSection } from './AdminSection';

const toDateTimeLocal = (ms: number): string => {
  const d = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toEpochMs = (value: string): number => new Date(value).getTime();

const EventManager = () => {
  const { name: ownerName, address: ownerAddress } = useAppSelector((state) => state.auth);
  const walletAddress = ownerAddress ?? '';
  const { data: eventData } = useGetEventsQuery(walletAddress);
  const [createEvent, { isLoading: isCreating }] = useCreateEventMutation();
  const [updateEvent, { isLoading: isUpdating }] = useUpdateEventMutation();
  const [archiveEvent] = useArchiveEventMutation();

  const events = eventData?.events ?? [];

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [qdnUrl, setQdnUrl] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editQdnUrl, setEditQdnUrl] = useState('');
  const [editFeedback, setEditFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => setFeedback(null), 5000);
  };

  const resetCreate = () => {
    setTitle('');
    setCategory('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setLocation('');
    setQdnUrl('');
    setShowCreate(false);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !description.trim() || !startDate) return;

    const startMs = toEpochMs(startDate);
    const endMs = endDate ? toEpochMs(endDate) : undefined;
    if (endMs !== undefined && endMs < startMs) {
      showFeedback('error', 'End date must be after the start date.');
      return;
    }

    try {
      await createEvent({
        title: title.trim(),
        category: category.trim() || 'General',
        description: description.trim(),
        startDate: startMs,
        endDate: endMs,
        location: location.trim() || undefined,
        qdnUrl: qdnUrl.trim() || undefined,
      }).unwrap();
      resetCreate();
      showFeedback('success', 'Event created.');
    } catch (error) {
      console.error('Failed to create event:', error);
      showFeedback('error', error instanceof Error ? error.message : 'Failed to create event.');
    }
  };

  const startEditing = (item: EventView) => {
    setEditingId(item.entityId);
    setEditTitle(item.title);
    setEditCategory(item.category);
    setEditDescription(item.description);
    setEditStartDate(toDateTimeLocal(item.startDateMs));
    setEditEndDate(item.endDateMs ? toDateTimeLocal(item.endDateMs) : '');
    setEditLocation(item.location ?? '');
    setEditQdnUrl(item.qdnUrl ?? '');
    setEditFeedback(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditFeedback(null);
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId || !editTitle.trim() || !editDescription.trim() || !editStartDate) return;

    const item = events.find((entry) => entry.entityId === editingId);
    if (!item) {
      setEditFeedback({ type: 'error', message: 'Event no longer available.' });
      return;
    }

    const startMs = toEpochMs(editStartDate);
    const endMs = editEndDate ? toEpochMs(editEndDate) : undefined;
    if (endMs !== undefined && endMs < startMs) {
      setEditFeedback({ type: 'error', message: 'End date must be after the start date.' });
      return;
    }

    try {
      await updateEvent({
        entityId: editingId,
        expectedRevision: item.revision,
        title: editTitle.trim(),
        category: editCategory.trim() || 'General',
        description: editDescription.trim(),
        startDate: startMs,
        endDate: endMs,
        location: editLocation.trim() || undefined,
        qdnUrl: editQdnUrl.trim() || undefined,
      }).unwrap();
      setEditFeedback({ type: 'success', message: 'Event updated!' });
      window.setTimeout(() => {
        setEditingId(null);
        setEditFeedback(null);
      }, 1200);
    } catch (error) {
      console.error('Failed to update event:', error);
      setEditFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update event.' });
    }
  };

  const handleArchive = async (item: EventView) => {
    if (!window.confirm(`Archive "${item.title}"?`)) return;
    try {
      await archiveEvent({
        entityId: item.entityId,
        expectedRevision: item.revision,
      }).unwrap();
      showFeedback('success', 'Event archived.');
    } catch (error) {
      console.error('Failed to archive event:', error);
      showFeedback('error', error instanceof Error ? error.message : 'Failed to archive event.');
    }
  };

  return (
    <AdminSection
      title="Events"
      description="Create, edit, and archive community events."
      action={
        <button
          type="button"
          onClick={() => setShowCreate((current) => !current)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          <Plus className="h-3.5 w-3.5" /> New Event
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
            <Calendar className="h-4 w-4 text-rose-500" />
            Create Event
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
                className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
                placeholder="Event title"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Category</label>
              <input
                type="text"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                maxLength={50}
                className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
                placeholder="Community, Governance, Workshop..."
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Description *</label>
              <RichTextEditor
                value={description}
                ownerName={ownerName ?? ''}
                onChange={setDescription}
                placeholder="Describe the event..."
                minRows={5}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Start date/time *</label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">End date/time (optional)</label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Location (optional)</label>
                <input
                  type="text"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  maxLength={200}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
                  placeholder="Online / Tallinn..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">QDN URL (optional)</label>
                <input
                  type="text"
                  value={qdnUrl}
                  onChange={(event) => setQdnUrl(event.target.value)}
                  maxLength={500}
                  className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
                  placeholder="qdn://DOCUMENT/Name/Identifier"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={isCreating || !title.trim() || !description.trim() || !startDate}
              className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Event'}
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
          <Calendar className="h-4 w-4 text-rose-500" />
          Existing Events
        </h3>

        {events.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No events to manage.</p>
        ) : (
          <div className="space-y-3">
            {events.map((item) => (
              <div
                key={item.entityId}
                className="rounded-lg border border-[var(--color-border-subtle)] p-4"
              >
                {editingId === item.entityId ? (
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
                    <input
                      type="text"
                      value={editCategory}
                      onChange={(event) => setEditCategory(event.target.value)}
                      className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm"
                      placeholder="Category"
                    />
                    <RichTextEditor
                      value={editDescription}
                      onChange={setEditDescription}
                      ownerName={ownerName ?? ''}
                      minRows={5}
                      placeholder="Edit description..."
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="datetime-local"
                        value={editStartDate}
                        onChange={(event) => setEditStartDate(event.target.value)}
                        required
                        className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm"
                      />
                      <input
                        type="datetime-local"
                        value={editEndDate}
                        onChange={(event) => setEditEndDate(event.target.value)}
                        className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={editLocation}
                        onChange={(event) => setEditLocation(event.target.value)}
                        placeholder="Location"
                        className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={editQdnUrl}
                        onChange={(event) => setEditQdnUrl(event.target.value)}
                        placeholder="QDN URL"
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
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {item.category} · {item.ownerName}
                        {item.status === 'archived' && ' · Archived'}
                      </p>
                    </div>
                    {item.status === 'active' && item.isOwner && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditing(item)}
                          className="rounded-lg border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-muted)] transition hover:border-cyan-300 hover:text-cyan-600"
                          title="Edit event"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(item)}
                          className="rounded-lg border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-muted)] transition hover:border-red-700 hover:text-red-400"
                          title="Archive event"
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

export default EventManager;
