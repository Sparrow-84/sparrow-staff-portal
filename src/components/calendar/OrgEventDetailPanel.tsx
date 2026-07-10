import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  addEventComment,
  deleteCalendarEvent,
  deleteCalendarEventAndFuture,
  fetchEventAttendees,
  fetchEventComments,
  notifyEventCommentMentions,
  removeAttendee,
  setMyAttendance,
  updateCalendarEvent,
  updateCalendarEventAndFuture,
  withTzOffset,
  toLocalDate,
  toLocalTime,
  KIND_LABEL,
  type CalendarEvent,
  type EventAttendee,
  type EventComment,
} from '@/lib/calendar';
import { parseMentionIds } from '@/lib/chat';
import { Drawer } from '@/components/lcp/Drawer';
import { MentionInput } from '@/components/chat/MentionInput';
import { CalendarLabelPicker } from '@/components/calendar/CalendarLabelPicker';
import { LABEL_COLORS } from '@/components/LabelPill';
import type { Profile } from '@/lib/types';

interface Props {
  event: CalendarEvent | null;
  currentUserId: string;
  isAdmin: boolean;
  profiles: Profile[];
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
  onOpenNotes: (event: CalendarEvent) => void;
}

export function OrgEventDetailPanel({ event, currentUserId, isAdmin, profiles, onClose, onDeleted, onUpdated, onOpenNotes }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [confirm, setConfirm] = useState(false);
  const [notesPreview, setNotesPreview] = useState<{ prep: string; live: string; shared: string } | null>(null);
  const [deletingMode, setDeletingMode] = useState<null | 'single' | 'future'>(null);
  const [saving, setSaving] = useState<null | 'single' | 'future'>(null);
  const [error, setError] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [eventComments, setEventComments] = useState<EventComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentPending, setCommentPending] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editLabelId, setEditLabelId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editEndDate, setEditEndDate] = useState(''); // multi-day all-day end date
  const [editAllDay, setEditAllDay] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editLocation, setEditLocation] = useState('');

  useEffect(() => {
    if (!event) { setNotesPreview(null); return; }
    const eventId = event.id;
    async function fetchNotesPreview() {
      const [{ data: priv }, { data: sharedData }] = await Promise.all([
        supabase
          .from('meeting_notes')
          .select('prep_notes, live_notes')
          .eq('event_id', eventId)
          .eq('user_id', currentUserId)
          .maybeSingle(),
        supabase
          .from('event_shared_notes')
          .select('notes')
          .eq('event_id', eventId)
          .maybeSingle(),
      ]);
      const prep = priv?.prep_notes ?? '';
      const live = priv?.live_notes ?? '';
      const shared = sharedData?.notes ?? '';
      setNotesPreview(prep || live || shared ? { prep, live, shared } : null);
    }
    void fetchNotesPreview();
  }, [event?.id, currentUserId]);

  // Load attendees whenever the event changes (skip personal events — they have no attendees)
  useEffect(() => {
    if (!event || event.is_personal) { setAttendees([]); return; }
    setAttendanceLoading(true);
    void fetchEventAttendees(event.id)
      .then(setAttendees)
      .finally(() => setAttendanceLoading(false));
  }, [event?.id]);

  // Load comments whenever the event changes
  useEffect(() => {
    if (!event) { setEventComments([]); setCommentText(''); return; }
    void fetchEventComments(event.id).then(setEventComments).catch(() => {});
  }, [event?.id]);

  const myRow = attendees.find((a) => a.staff_id === currentUserId);
  // All Staff default ON, dept default OFF
  const isAttending = event?.department === null
    ? myRow?.status !== 'opted_out'
    : myRow?.status === 'attending';

  async function toggleAttendance() {
    if (!event) return;
    setAttendanceLoading(true);
    try {
      if (event.department === null) {
        // All Staff: toggle opt-out
        if (myRow?.status === 'opted_out') {
          await removeAttendee(event.id, currentUserId);
        } else {
          await setMyAttendance(event.id, currentUserId, 'opted_out');
        }
      } else {
        // Dept: toggle attending
        if (myRow?.status === 'attending') {
          await removeAttendee(event.id, currentUserId);
        } else {
          await setMyAttendance(event.id, currentUserId, 'attending');
        }
      }
      setAttendees(await fetchEventAttendees(event.id));
      onUpdated();
    } finally {
      setAttendanceLoading(false);
    }
  }

  function handleClose() {
    setMode('view');
    setConfirm(false);
    setError(null);
    onClose();
  }

  async function postComment() {
    if (!event || !commentText.trim() || commentPending) return;
    const body = commentText.trim();
    setCommentPending(true);
    try {
      await addEventComment(event.id, body, currentUserId);
      const mentioned = parseMentionIds(body, profiles);
      if (mentioned.length) {
        void notifyEventCommentMentions(mentioned, currentUserId, event.id, body).catch(() => {});
      }
      setCommentText('');
      setEventComments(await fetchEventComments(event.id));
    } finally {
      setCommentPending(false);
    }
  }

  function enterEdit() {
    if (!event) return;
    setEditTitle(event.title);
    setEditLabelId(event.label_id ?? null);
    setEditAllDay(event.all_day);
    // All-day events are stored as UTC midnight (e.g. 2026-07-07T00:00:00+00:00).
    // Using toLocalDate() on those returns the PREVIOUS day in any timezone west of UTC.
    // Slice the ISO string directly to get the stored calendar date.
    const startD = event.all_day ? event.starts_at.slice(0, 10) : toLocalDate(event.starts_at);
    const endD = event.ends_at
      ? (event.all_day ? event.ends_at.slice(0, 10) : toLocalDate(event.ends_at))
      : '';
    setEditDate(startD);
    setEditEndDate(event.all_day && endD && endD > startD ? endD : '');
    setEditStartTime(event.all_day ? '09:00' : toLocalTime(event.starts_at));
    setEditEndTime(!event.all_day && event.ends_at ? toLocalTime(event.ends_at) : '');
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
      const newEndsAt = editAllDay && editEndDate && editEndDate > editDate
        ? `${editEndDate}T00:00:00+00:00`
        : !editAllDay && editEndTime
          ? withTzOffset(editDate, editEndTime)
          : null;

      const basePatch = {
        title: editTitle.trim(),
        kind: event.kind, // preserve original kind — not editable via UI
        label_id: editLabelId,
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

  // For all-day events use the ISO date component directly (avoids UTC-midnight timezone shift).
  // Use noon local time for Date objects so toLocaleDateString() never returns the wrong day.
  const startDateStr = event.all_day ? event.starts_at.slice(0, 10) : toLocalDate(event.starts_at);
  const endDateStr = event.ends_at
    ? (event.all_day ? event.ends_at.slice(0, 10) : toLocalDate(event.ends_at))
    : '';
  const isMultiDay = event.all_day && endDateStr && endDateStr > startDateStr;
  const startsAt = event.all_day ? new Date(startDateStr + 'T12:00:00') : new Date(event.starts_at);
  const endsAt = event.ends_at
    ? (event.all_day ? new Date(endDateStr + 'T12:00:00') : new Date(event.ends_at))
    : null;

  const dateLabel = isMultiDay
    ? `${startsAt.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' })} – ${endsAt!.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}`
    : startsAt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeLabel = event.all_day
    ? isMultiDay ? 'Multi-day event' : 'All day'
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

    // Delete confirmation — show just the confirmation, no other actions
    if (confirm) {
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

    // View mode — Meeting Notes always visible; edit/delete only for editors
    return (
      <div className="space-y-2">
        <button
          onClick={() => onOpenNotes(event!)}
          className="btn-primary w-full"
        >
          Meeting Notes
        </button>
        {canEdit && (
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
        )}
      </div>
    );
  }

  return (
    <Drawer
      open={!!event}
      onClose={handleClose}
      title={mode === 'edit' ? 'Edit Event' : event.title}
      subtitle={mode === 'edit' ? undefined : (event.label?.name ?? KIND_LABEL[event.kind])}
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

          <CalendarLabelPicker
            value={editLabelId}
            isPersonal={event.is_personal}
            department={event.is_personal ? null : event.department}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onChange={(id) => setEditLabelId(id)}
          />

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
            <div className={editAllDay ? 'col-span-1' : 'col-span-2'}>
              <label className="field-label">{editAllDay ? 'Start date' : 'Date'}</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => {
                  setEditDate(e.target.value);
                  // Clear end date if start moves to or past it
                  if (editEndDate && e.target.value >= editEndDate) setEditEndDate('');
                }}
                className="field-input"
              />
            </div>
            {editAllDay && (
              <div>
                <label className="field-label">
                  End date <span className="font-normal text-sparrow-gray">(optional)</span>
                </label>
                <input
                  type="date"
                  value={editEndDate}
                  min={editDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  className="field-input"
                />
              </div>
            )}
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
          <div className="flex flex-wrap gap-2">
            {event.label ? (
              <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${LABEL_COLORS.find((c) => c.id === event.label!.color)?.pill ?? 'bg-slate-100 text-slate-600'}`}>
                {event.label.name}
              </span>
            ) : (
              <span className="inline-block rounded-full bg-sparrow-mist px-3 py-1 text-xs font-medium text-sparrow-gray">
                {KIND_LABEL[event.kind]}
              </span>
            )}
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

          {/* Attendance — hidden for personal events */}
          {!event.is_personal && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Attendance</p>
              <div className="mt-1.5 flex items-center gap-3">
                <button
                  onClick={() => void toggleAttendance()}
                  disabled={attendanceLoading}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isAttending
                      ? 'bg-sparrow-green text-white hover:bg-sparrow-green/90'
                      : 'bg-sparrow-mist text-sparrow-gray hover:text-sparrow-ink'
                  }`}
                >
                  {isAttending ? '✓ Attending' : 'Not attending'}
                </button>
                {event.department === null && (
                  <span className="text-xs text-sparrow-gray">All Staff — attending by default</span>
                )}
              </div>
              {(() => {
                const goingIds = attendees.filter((a) => a.status === 'attending').map((a) => a.staff_id);
                const names = goingIds
                  .filter((id) => id !== currentUserId)
                  .map((id) => profiles.find((p) => p.id === id)?.full_name)
                  .filter(Boolean);
                return names.length > 0 ? (
                  <p className="mt-1.5 text-xs text-sparrow-gray">
                    Also attending: {names.join(', ')}
                  </p>
                ) : null;
              })()}
            </div>
          )}

          {notesPreview && (notesPreview.prep || notesPreview.live || notesPreview.shared) && (
            <div className="space-y-3">
              {notesPreview.prep && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Prep Notes</p>
                  <div
                    className="mt-1.5 max-h-36 overflow-y-auto rounded-lg bg-amber-50 p-3 text-sm leading-relaxed text-sparrow-ink [&_b]:font-semibold [&_li]:mb-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4"
                    dangerouslySetInnerHTML={{ __html: notesPreview.prep }}
                  />
                </div>
              )}
              {notesPreview.live && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green">Live Notes</p>
                  <div
                    className="mt-1.5 max-h-36 overflow-y-auto rounded-lg bg-green-50 p-3 text-sm leading-relaxed text-sparrow-ink [&_b]:font-semibold [&_li]:mb-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4"
                    dangerouslySetInnerHTML={{ __html: notesPreview.live }}
                  />
                </div>
              )}
              {notesPreview.shared && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Shared Notes</p>
                  <div
                    className="mt-1.5 max-h-36 overflow-y-auto rounded-lg bg-blue-50 p-3 text-sm leading-relaxed text-sparrow-ink [&_b]:font-semibold [&_li]:mb-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4"
                    dangerouslySetInnerHTML={{ __html: notesPreview.shared }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          <div className="border-t border-sparrow-rule pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Comments</p>
            <ul className="mt-2 space-y-3">
              {eventComments.length === 0 && (
                <li className="text-sm text-sparrow-gray">No comments yet.</li>
              )}
              {eventComments.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium text-sparrow-ink">{c.author?.full_name ?? 'Staff'}</span>
                  <span className="ml-2 text-xs text-sparrow-gray">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                  <p className="text-sparrow-ink">{c.body}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-end gap-2">
              <MentionInput
                value={commentText}
                onChange={setCommentText}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) void postComment(); }}
                staff={profiles}
                disabled={commentPending}
                placeholder="Add a comment… (@ to mention)"
                className="field-input mt-0 max-h-24 w-full resize-none"
              />
              <button
                onClick={() => void postComment()}
                disabled={commentPending || !commentText.trim()}
                className="btn-ghost"
              >
                Post
              </button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
