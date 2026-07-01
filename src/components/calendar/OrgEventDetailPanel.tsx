import { useState } from 'react';
import {
  ADD_KINDS,
  deleteCalendarEvent,
  deleteCalendarEventAndFuture,
  updateCalendarEvent,
  updateCalendarEventAndFuture,
  withTzOffset,
  toLocalDate,
  toLocalTime,
  KIND_LABEL,
  KIND_PILL,
  type CalendarEvent,
  type CalendarKind,
} from '@/lib/calendar';
import { Drawer } from '@/components/lcp/Drawer';

interface Props {
  event: CalendarEvent | null;
  currentUserId: string;
  isAdmin: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
}

export function OrgEventDetailPanel({ event, currentUserId, isAdmin, onClose, onDeleted, onUpdated }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [confirm, setConfirm] = useState(false);
  const [deletingMode, setDeletingMode] = useState<null | 'single' | 'future'>(null);
  const [saving, setSaving] = useState<null | 'single' | 'future'>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editKind, setEditKind] = useState<CalendarKind>('other');
  const [editDate, setEditDate] = useState('');
  const [editAllDay, setEditAllDay] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editLocation, setEditLocation] = useState('');

  function handleClose() {
    setMode('view');
    setConfirm(false);
    setError(null);
    onClose();
  }

  function enterEdit() {
    if (!event) return;
    setEditTitle(event.title);
    setEditKind(event.kind);
    setEditDate(toLocalDate(event.starts_at));
    setEditAllDay(event.all_day);
    setEditStartTime(event.all_day ? '09:00' : toLocalTime(event.starts_at));
    setEditEndTime(event.ends_at ? toLocalTime(event.ends_at) : '');
    setEditLocation(event.location ?? '');
    setError(null);
    setMode('edit');
  }

  function cancelEdit() {
    setMode('view');
    setError(null);
  }

  async function handleSave(saveMode: 'single' | 'future') {
    if (!event) return;
    setSaving(saveMode);
    setError(null);
    try {
      const newStartsAt = editAllDay
        ? `${editDate}T00:00:00+00:00`
        : withTzOffset(editDate, editStartTime);
      const newEndsAt = !editAllDay && editEndTime
        ? withTzOffset(editDate, editEndTime)
        : null;

      const basePatch = {
        title: editTitle.trim(),
        kind: editKind,
        all_day: editAllDay,
        location: editLocation.trim() || null,
      };

      if (saveMode === 'future' && event.recurrence_id) {
        await updateCalendarEventAndFuture(
          event.recurrence_id,
          event.starts_at,
          basePatch,
          editAllDay ? undefined : editStartTime,
          editAllDay ? undefined : (editEndTime || null),
        );
        // Apply this event's (possibly new) date on top
        await updateCalendarEvent(event.id, { ...basePatch, starts_at: newStartsAt, ends_at: newEndsAt });
      } else {
        await updateCalendarEvent(event.id, { ...basePatch, starts_at: newStartsAt, ends_at: newEndsAt });
      }

      setMode('view');
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(mode: 'single' | 'future') {
    if (!event) return;
    setDeletingMode(mode);
    setError(null);
    try {
      if (mode === 'future' && event.recurrence_id) {
        await deleteCalendarEventAndFuture(event.recurrence_id, event.starts_at);
      } else {
        await deleteCalendarEvent(event.id);
      }
      setDeletingMode(null);
      setConfirm(false);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
      setDeletingMode(null);
    }
  }

  if (!event) return null;

  const canEdit = isAdmin || event.created_by === currentUserId;
  const isRecurring = !!event.recurrence_id;
  const canSave = editTitle.trim().length > 0 && editDate && (editAllDay || editStartTime);

  const startsAt = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;
  const dateLabel = startsAt.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const timeLabel = event.all_day
    ? 'All day'
    : endsAt
      ? `${startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${endsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
      : startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  function renderFooter() {
    if (mode === 'edit') {
      return (
        <div className="space-y-2">
          {error && <p className="text-xs text-priority-p1">{error}</p>}
          {isRecurring ? (
            <>
              <button
                onClick={() => handleSave('single')}
                disabled={!canSave || !!saving}
                className="btn-primary w-full"
              >
                {saving === 'single' ? 'Saving…' : 'Save this event'}
              </button>
              <button
                onClick={() => handleSave('future')}
                disabled={!canSave || !!saving}
                className="w-full rounded-xl border border-sparrow-green py-2 text-sm font-medium text-sparrow-green hover:bg-sparrow-green/5"
              >
                {saving === 'future' ? 'Saving…' : 'Save this + all future'}
              </button>
            </>
          ) : (
            <button
              onClick={() => handleSave('single')}
              disabled={!canSave || !!saving}
              className="btn-primary w-full"
            >
              {saving === 'single' ? 'Saving…' : 'Save changes'}
            </button>
          )}
          <button onClick={cancelEdit} disabled={!!saving} className="btn-ghost w-full text-sm">
            Cancel
          </button>
        </div>
      );
    }

    if (!canEdit) return undefined;

    if (!confirm) {
      return (
        <div className="flex gap-2">
          <button onClick={enterEdit} className="flex-1 btn-ghost text-sm">
            Edit
          </button>
          <button
            onClick={() => setConfirm(true)}
            className="flex-1 rounded-xl border border-priority-p1/40 py-2 text-sm font-medium text-priority-p1 hover:bg-priority-p1/5"
          >
            Delete
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-xs text-sparrow-gray">
          {isRecurring
            ? 'Delete just this event, or this one and all future events in the series?'
            : 'This cannot be undone.'}
        </p>
        {error && <p className="text-xs text-priority-p1">{error}</p>}
        <div className="flex flex-col gap-2">
          {isRecurring ? (
            <>
              <button
                onClick={() => handleDelete('single')}
                disabled={deletingMode !== null}
                className="w-full rounded-xl border border-priority-p1/40 py-2 text-sm font-medium text-priority-p1 hover:bg-priority-p1/5"
              >
                {deletingMode === 'single' ? 'Deleting…' : 'This event only'}
              </button>
              <button
                onClick={() => handleDelete('future')}
                disabled={deletingMode !== null}
                className="w-full rounded-xl bg-priority-p1 py-2 text-sm font-medium text-white hover:bg-priority-p1/90"
              >
                {deletingMode === 'future' ? 'Deleting…' : 'This and all future events'}
              </button>
            </>
          ) : (
            <button
              onClick={() => handleDelete('single')}
              disabled={deletingMode !== null}
              className="w-full rounded-xl bg-priority-p1 py-2 text-sm font-medium text-white hover:bg-priority-p1/90"
            >
              {deletingMode === 'single' ? 'Deleting…' : 'Confirm delete'}
            </button>
          )}
          <button
            onClick={() => setConfirm(false)}
            disabled={deletingMode !== null}
            className="btn-ghost w-full text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <Drawer
      open={!!event}
      onClose={handleClose}
      title={mode === 'edit' ? 'Edit Event' : event.title}
      subtitle={mode === 'edit' ? undefined : KIND_LABEL[event.kind]}
      footer={renderFooter()}
    >
      {mode === 'edit' ? (
        <div className="space-y-5">
          <div>
            <label className="field-label">Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label">Type</label>
            <select value={editKind} onChange={(e) => setEditKind(e.target.value as CalendarKind)} className="field-input">
              {ADD_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-sparrow-ink">
            <input
              type="checkbox"
              checked={editAllDay}
              onChange={(e) => setEditAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
            />
            All day
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="field-label">Date</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="field-input"
              />
            </div>
            {!editAllDay && (
              <>
                <div>
                  <label className="field-label">Start time</label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label">
                    End time <span className="font-normal text-sparrow-gray">(optional)</span>
                  </label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="field-input"
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <label className="field-label">
              Location <span className="font-normal text-sparrow-gray">(optional)</span>
            </label>
            <input
              type="text"
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              className="field-input"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-2">
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${KIND_PILL[event.kind]}`}>
              {KIND_LABEL[event.kind]}
            </span>
            {isRecurring && (
              <span className="inline-block rounded-full bg-sparrow-mist px-3 py-1 text-xs font-medium text-sparrow-gray">
                Recurring
              </span>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-sparrow-ink">{dateLabel}</p>
            <p className="mt-0.5 text-sm text-sparrow-gray">{timeLabel}</p>
          </div>

          {event.location && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Location</p>
              <p className="mt-0.5 text-sm text-sparrow-ink">{event.location}</p>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
