import { useState } from 'react';
import { EVENT_LABEL, type EventKind, type LcpEvent } from '@/lib/lcp-types';
import { deleteEvent, deleteEventAndFuture, updateEvent, updateEventAndFuture } from '@/lib/lcp';
import { withTzOffset, toLocalDate, toLocalTime } from '@/lib/calendar';
import { dayLabel, timeLabel } from '@/lib/lcp-format';
import { useAuth } from '@/auth/AuthContext';
import { sendPush, sendLcpFamilyPush } from '@/lib/push';
import { Drawer } from './Drawer';

const KIND_COLOR: Record<string, string> = {
  curriculum: 'bg-sparrow-green/10 text-sparrow-green',
  one_on_one:  'bg-amber-100 text-amber-700',
  dinner:      'bg-violet-100 text-violet-700',
  volunteer:   'bg-sky-100 text-sky-700',
  other:       'bg-slate-100 text-slate-600',
};

const EVENT_KINDS = Object.keys(EVENT_LABEL) as EventKind[];

interface Props {
  event: LcpEvent | null;
  onClose: () => void;
  onLogSession: (event: LcpEvent) => void;
  onDeleted: () => void;
  onChanged?: () => void;
}

export function EventDetailPanel({ event, onClose, onLogSession, onDeleted, onChanged }: Props) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [confirmStep, setConfirmStep] = useState<'idle' | 'confirm'>('idle');
  const [deletingMode, setDeletingMode] = useState<null | 'single' | 'future'>(null);
  const [saving, setSaving] = useState<null | 'single' | 'future'>(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editKind, setEditKind] = useState<EventKind>('other');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editMandatory, setEditMandatory] = useState(false);

  function handleClose() {
    setMode('view');
    setConfirmStep('idle');
    setError(null);
    onClose();
  }

  function enterEdit() {
    if (!event) return;
    setEditTitle(event.title);
    setEditKind(event.kind);
    setEditDate(toLocalDate(event.starts_at));
    setEditStartTime(toLocalTime(event.starts_at));
    setEditEndTime(event.ends_at ? toLocalTime(event.ends_at) : '');
    setEditLocation(event.location ?? '');
    setEditMandatory(event.mandatory);
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
      const newStartsAt = withTzOffset(editDate, editStartTime);
      const newEndsAt = editEndTime ? withTzOffset(editDate, editEndTime) : null;

      const basePatch = {
        title: editTitle.trim(),
        kind: editKind,
        mandatory: editMandatory,
        location: editLocation.trim() || null,
      };

      if (saveMode === 'future' && event.recurrence_id) {
        await updateEventAndFuture(
          event.recurrence_id,
          event.starts_at,
          basePatch,
          editStartTime,
          editEndTime || null,
        );
        await updateEvent(event.id, { ...basePatch, starts_at: newStartsAt, ends_at: newEndsAt });
      } else {
        await updateEvent(event.id, { ...basePatch, starts_at: newStartsAt, ends_at: newEndsAt });
      }

      setMode('view');
      const pushTitle = 'LCP schedule update';
      const pushBody = `${editTitle.trim()} has been updated`;
      void sendPush({
        to: 'staff',
        excludeId: profile?.id,
        title: pushTitle,
        body: pushBody,
        url: `${window.location.origin}/lcp`,
      });
      void sendLcpFamilyPush({
        title: pushTitle,
        body: pushBody,
        url: `${window.location.origin}/`,
      });
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(null);
    }
  }

  async function toggleOrgCal() {
    if (!event) return;
    setToggling(true);
    try {
      await updateEvent(event.id, { show_on_org_calendar: !event.show_on_org_calendar });
      onChanged?.();
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete(mode: 'single' | 'future') {
    if (!event) return;
    setDeletingMode(mode);
    setError(null);
    try {
      if (mode === 'future' && event.recurrence_id) {
        await deleteEventAndFuture(event.recurrence_id, event.starts_at);
      } else {
        await deleteEvent(event.id);
      }
      setDeletingMode(null);
      setConfirmStep('idle');
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
      setDeletingMode(null);
    }
  }

  if (!event) return null;

  const hasEnds = !!event.ends_at;
  const timeRange = hasEnds
    ? `${timeLabel(event.starts_at)} – ${timeLabel(event.ends_at!)}`
    : timeLabel(event.starts_at);
  const isRecurring = !!event.recurrence_id;
  const canSave = editTitle.trim().length > 0 && editDate && editStartTime;

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

    if (confirmStep === 'idle') {
      return (
        <div className="flex gap-2">
          <button onClick={enterEdit} className="flex-1 btn-ghost text-sm">
            Edit
          </button>
          <button
            onClick={() => setConfirmStep('confirm')}
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
            onClick={() => setConfirmStep('idle')}
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
      subtitle={mode === 'edit' ? undefined : EVENT_LABEL[event.kind]}
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
            <select value={editKind} onChange={(e) => setEditKind(e.target.value as EventKind)} className="field-input">
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>{EVENT_LABEL[k]}</option>
              ))}
            </select>
          </div>

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

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-sparrow-ink">
            <input
              type="checkbox"
              checked={editMandatory}
              onChange={(e) => setEditMandatory(e.target.checked)}
              className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
            />
            Mandatory attendance
          </label>
        </div>
      ) : (
        <div className="space-y-5">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${KIND_COLOR[event.kind] ?? 'bg-slate-100 text-slate-600'}`}>
            {EVENT_LABEL[event.kind]}
          </span>

          <div>
            <p className="text-sm font-medium text-sparrow-ink">{dayLabel(event.starts_at)}</p>
            <p className="mt-0.5 text-sm text-sparrow-gray">{timeRange}</p>
          </div>

          {event.location && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Location</p>
              <p className="mt-0.5 text-sm text-sparrow-ink">{event.location}</p>
            </div>
          )}

          <div className="flex gap-2">
            {event.mandatory && (
              <span className="rounded-full bg-sparrow-mist px-2.5 py-1 text-xs font-medium text-sparrow-gray">
                Mandatory
              </span>
            )}
            {isRecurring && (
              <span className="rounded-full bg-sparrow-mist px-2.5 py-1 text-xs font-medium text-sparrow-gray">
                Recurring
              </span>
            )}
          </div>

          <div className="border-t border-sparrow-rule pt-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-sparrow-ink">Show on all-staff calendar</span>
              <button
                onClick={toggleOrgCal}
                disabled={toggling}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  event.show_on_org_calendar ? 'bg-sparrow-green' : 'bg-slate-200'
                } ${toggling ? 'opacity-50' : ''}`}
                role="switch"
                aria-checked={event.show_on_org_calendar}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${event.show_on_org_calendar ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </label>
          </div>

          <div className="border-t border-sparrow-rule pt-4">
            <button
              onClick={() => { handleClose(); onLogSession(event); }}
              className="btn-primary w-full"
            >
              Log session →
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
