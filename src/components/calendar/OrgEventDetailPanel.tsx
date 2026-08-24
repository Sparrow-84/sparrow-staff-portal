import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  addEventComment,
  deleteCalendarEvent,
  deleteCalendarEventAndFuture,
  fetchEventAttendees,
  fetchEventComments,
  fetchOfficeRooms,
  notifyEventCommentMentions,
  removeAttendee,
  setMyAttendance,
  setMyAttendanceForSeries,
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
import { sendPush } from '@/lib/push';
import { Drawer } from '@/components/lcp/Drawer';
import { MentionInput } from '@/components/chat/MentionInput';
import { CalendarLabelPicker } from '@/components/calendar/CalendarLabelPicker';
import { LABEL_COLORS } from '@/components/LabelPill';
import type { OfficeRoom, Profile } from '@/lib/types';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { fetchExternalInvites, inviteExternalToEvent, type ExternalInvite } from '@/lib/externalInvites';

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
  // When a recurring event's attendance is changed, ask whether it applies to
  // just this occurrence or this + all future ones (mirrors edit/delete).
  const [attendancePrompt, setAttendancePrompt] = useState<boolean | null>(null);
  const [eventComments, setEventComments] = useState<EventComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentPending, setCommentPending] = useState(false);

  // Invite someone outside Sparrow
  const [externalInvites, setExternalInvites] = useState<ExternalInvite[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState<string | null>(null);

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editLabelId, setEditLabelId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editEndDate, setEditEndDate] = useState(''); // multi-day all-day end date
  const [editAllDay, setEditAllDay] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [rooms, setRooms] = useState<OfficeRoom[]>([]);
  const [editRoomId, setEditRoomId] = useState('');
  const [editIsPrivateMeeting, setEditIsPrivateMeeting] = useState(false);

  useEffect(() => { void fetchOfficeRooms().then(setRooms); }, []);

  const { missingMessage, validate, fieldClass, fieldError, clear, reset: resetValidation } = useRequiredFields([
    { key: 'org-edit-title', label: 'Title', valid: editTitle.trim().length > 0 },
    { key: 'org-edit-date', label: 'Date', valid: !!editDate },
    { key: 'org-edit-start-time', label: 'Start time', valid: editAllDay || !!editStartTime },
  ]);

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

  // Load who's already been invited from outside, whenever the event changes
  useEffect(() => {
    setInviteOpen(false);
    setInviteEmail('');
    setInviteNote('');
    setInviteError(null);
    setInviteSent(null);
    if (!event) { setExternalInvites([]); return; }
    void fetchExternalInvites(event.id).then(setExternalInvites);
  }, [event?.id]);

  async function sendExternalInvite() {
    if (!event || !inviteEmail.trim() || invitePending) return;
    setInvitePending(true);
    setInviteError(null);
    try {
      await inviteExternalToEvent(event.id, inviteEmail.trim(), inviteNote.trim() || null);
      setExternalInvites(await fetchExternalInvites(event.id));
      setInviteSent(inviteEmail.trim());
      setInviteEmail('');
      setInviteNote('');
      setInviteOpen(false);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not send the invite.');
    } finally {
      setInvitePending(false);
    }
  }

  // Load attendees whenever the event changes (skip personal events — they have no attendees)
  useEffect(() => {
    setAttendancePrompt(null);
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

  function setAttendance(attending: boolean) {
    if (!event || isAttending === attending) return;
    // Recurring events ask whether this applies to just this occurrence or
    // this + all future ones, instead of forcing a click per occurrence.
    if (event.recurrence_id) {
      setAttendancePrompt(attending);
      return;
    }
    void applyAttendance(attending, 'single');
  }

  async function applyAttendance(attending: boolean, scope: 'single' | 'future') {
    if (!event) return;
    setAttendanceLoading(true);
    try {
      if (scope === 'future' && event.recurrence_id) {
        await setMyAttendanceForSeries(event.recurrence_id, event.starts_at, currentUserId, attending, event.department === null);
      } else if (event.department === null) {
        // All Staff defaults to attending; only store a row when declining
        if (attending) await removeAttendee(event.id, currentUserId);
        else await setMyAttendance(event.id, currentUserId, 'opted_out');
      } else {
        // Dept events default to not attending; only store a row when accepting
        if (attending) await setMyAttendance(event.id, currentUserId, 'attending');
        else await removeAttendee(event.id, currentUserId);
      }
      setAttendees(await fetchEventAttendees(event.id));
      setAttendancePrompt(null);
      onUpdated();
    } finally {
      setAttendanceLoading(false);
    }
  }

  function handleClose() {
    setMode('view');
    setConfirm(false);
    setAttendancePrompt(null);
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
    setEditRoomId(event.room_id ?? '');
    setEditIsPrivateMeeting(event.is_private_meeting);
    setError(null);
    resetValidation();
    setMode('edit');
  }

  function cancelEdit() {
    setMode('view');
    setError(null);
    resetValidation();
  }

  async function handleSave(saveMode: 'single' | 'future') {
    if (!event || !validate()) return;
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

      const selectedRoom = rooms.find((r) => r.id === editRoomId) ?? null;
      const basePatch = {
        title: editTitle.trim(),
        kind: event.kind, // preserve original kind — not editable via UI
        label_id: editLabelId,
        all_day: editAllDay,
        location: editLocation.trim() || null,
        room_id: editRoomId || null,
        is_private_meeting: selectedRoom?.blocks_whole_office ? editIsPrivateMeeting : false,
      };

      if (saveMode === 'future' && event.recurrence_id) {
        // If the edited event's date moved, shift every following occurrence by the same
        // amount instead of only changing the one being edited.
        const oldDateOnly = event.all_day ? event.starts_at.slice(0, 10) : toLocalDate(event.starts_at);
        const dateDeltaMs =
          editDate !== oldDateOnly
            ? new Date(`${editDate}T12:00:00`).getTime() - new Date(`${oldDateOnly}T12:00:00`).getTime()
            : 0;
        await updateCalendarEventAndFuture(
          event.recurrence_id,
          event.starts_at,
          basePatch,
          editAllDay ? undefined : editStartTime,
          editAllDay ? undefined : (editEndTime || null),
          dateDeltaMs || undefined,
        );
      } else {
        await updateCalendarEvent(event.id, { ...basePatch, starts_at: newStartsAt, ends_at: newEndsAt });
      }

      setMode('view');
      void sendPush({
        to: 'staff',
        excludeId: currentUserId,
        title: 'Calendar update',
        body: `${editTitle.trim()} has been updated`,
        url: `${window.location.origin}/calendar`,
      });
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
  // Synced from the LCP Session Cal — title/time/location and deletion stay
  // Session Cal-only (enforced in the DB too); RSVP/comments/labels/room
  // booking are fully editable here same as any other event.
  const isLcpSession = event.source_system === 'lcp_session';

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
          {(error || missingMessage) && <p className="text-xs text-priority-p1">{error ?? missingMessage}</p>}
          {isRecurring ? (
            <>
              <button
                onClick={() => handleSave('single')}
                disabled={!!saving}
                className="btn-primary w-full"
              >
                {saving === 'single' ? 'Saving…' : 'Save this event'}
              </button>
              <button
                onClick={() => handleSave('future')}
                disabled={!!saving}
                className="w-full rounded-xl border border-sparrow-green dark:border-sparrow-dark-green py-2 text-sm font-medium text-sparrow-green dark:text-sparrow-dark-green hover:bg-sparrow-green/5"
              >
                {saving === 'future' ? 'Saving…' : 'Save this + all future'}
              </button>
            </>
          ) : (
            <button
              onClick={() => handleSave('single')}
              disabled={!!saving}
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
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
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
          Notes
        </button>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={enterEdit} className="flex-1 btn-ghost text-sm">
              Edit
            </button>
            {!isLcpSession && (
              <button
                onClick={() => setConfirm(true)}
                className="flex-1 rounded-xl border border-priority-p1/40 py-2 text-sm font-medium text-priority-p1 hover:bg-priority-p1/5"
              >
                Delete
              </button>
            )}
          </div>
        )}
        {canEdit && isLcpSession && (
          <p className="text-center text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Delete this session from the LCP Session Cal.</p>
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
          {isLcpSession && (
            <div className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/50 dark:bg-sparrow-dark-surface2/50 p-3">
              <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{event.title}</p>
              <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{dateLabel} · {timeLabel}{event.location ? ` · ${event.location}` : ''}</p>
              <p className="mt-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Title, time, and location are managed on the LCP Session Cal.</p>
            </div>
          )}

          {!isLcpSession && (
            <div>
              <label className="field-label field-label-required" htmlFor="org-edit-title">Title</label>
              <input
                id="org-edit-title"
                type="text"
                value={editTitle}
                onChange={(e) => { setEditTitle(e.target.value); clear('org-edit-title'); }}
                className={fieldClass('org-edit-title')}
              />
              {fieldError('org-edit-title') && <p className="mt-1 text-xs text-priority-p1">{fieldError('org-edit-title')}</p>}
            </div>
          )}

          <CalendarLabelPicker
            value={editLabelId}
            isPersonal={event.is_personal}
            department={event.is_personal ? null : event.department}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onChange={(id) => setEditLabelId(id)}
          />

          {!isLcpSession && (
            <>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
                <input
                  type="checkbox"
                  checked={editAllDay}
                  onChange={(e) => setEditAllDay(e.target.checked)}
                  className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
                />
                All day
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div className={editAllDay ? 'col-span-1' : 'col-span-2'}>
                  <label className="field-label field-label-required" htmlFor="org-edit-date">{editAllDay ? 'Start date' : 'Date'}</label>
                  <input
                    id="org-edit-date"
                    type="date"
                    value={editDate}
                    onChange={(e) => {
                      setEditDate(e.target.value);
                      clear('org-edit-date');
                      // Clear end date if start moves to or past it
                      if (editEndDate && e.target.value >= editEndDate) setEditEndDate('');
                    }}
                    className={fieldClass('org-edit-date')}
                  />
                  {fieldError('org-edit-date') && <p className="mt-1 text-xs text-priority-p1">{fieldError('org-edit-date')}</p>}
                </div>
                {editAllDay && (
                  <div>
                    <label className="field-label">
                      End date <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional)</span>
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
                      <label className="field-label field-label-required" htmlFor="org-edit-start-time">Start time</label>
                      <input
                        id="org-edit-start-time"
                        type="time"
                        value={editStartTime}
                        onChange={(e) => { setEditStartTime(e.target.value); clear('org-edit-start-time'); }}
                        className={fieldClass('org-edit-start-time')}
                      />
                      {fieldError('org-edit-start-time') && <p className="mt-1 text-xs text-priority-p1">{fieldError('org-edit-start-time')}</p>}
                    </div>
                    <div>
                      <label className="field-label">
                        End time <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional)</span>
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
                  Location <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional)</span>
                </label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="field-input"
                />
              </div>
            </>
          )}

          {rooms.length > 0 && (
            <div>
              <label className="field-label">
                Office room <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional)</span>
              </label>
              <select
                value={editRoomId}
                onChange={(e) => { setEditRoomId(e.target.value); setEditIsPrivateMeeting(false); }}
                className="field-input"
              >
                <option value="">No room booked</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {editRoomId && rooms.find((r) => r.id === editRoomId)?.blocks_whole_office && (
                <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
                  <input
                    type="checkbox"
                    checked={editIsPrivateMeeting}
                    onChange={(e) => setEditIsPrivateMeeting(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
                  />
                  <span>
                    <span className="font-medium">Private meeting — do not walk through</span>
                    <span className="mt-0.5 block text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                      This blocks the whole office. Other rooms will show as unavailable during this time.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {event.label ? (
              <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${LABEL_COLORS.find((c) => c.id === event.label!.color)?.pill ?? 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300'}`}>
                {event.label.name}
              </span>
            ) : (
              <span className="inline-block rounded-full bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-3 py-1 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
                {KIND_LABEL[event.kind]}
              </span>
            )}
            {isRecurring && (
              <span className="inline-block rounded-full bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-3 py-1 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
                Recurring
              </span>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{dateLabel}</p>
            <p className="mt-0.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{timeLabel}</p>
            {!event.is_personal && (
              <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                Created by {event.creator?.full_name ?? (event.created_by ? 'a staff member' : 'system')}
              </p>
            )}
          </div>

          {event.location && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Location</p>
              <p className="mt-0.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{event.location}</p>
            </div>
          )}

          {/* Attendance — hidden for personal events */}
          {!event.is_personal && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Attending?</p>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  onClick={() => setAttendance(true)}
                  disabled={attendanceLoading}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                    isAttending
                      ? 'bg-sparrow-green text-white hover:bg-sparrow-green/90'
                      : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
                  }`}
                >
                  Yes
                </button>
                <button
                  onClick={() => setAttendance(false)}
                  disabled={attendanceLoading}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                    !isAttending
                      ? 'bg-priority-p1 text-white hover:bg-priority-p1/90'
                      : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
                  }`}
                >
                  No
                </button>
              </div>
              {attendancePrompt !== null && (
                <div className="mt-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/50 dark:bg-sparrow-dark-surface2/50 p-2.5">
                  <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                    Apply to just this occurrence, or this and every future one in the series?
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <button
                      onClick={() => void applyAttendance(attendancePrompt, 'single')}
                      disabled={attendanceLoading}
                      className="w-full rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface py-1.5 text-xs font-medium text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                    >
                      Just this one
                    </button>
                    <button
                      onClick={() => void applyAttendance(attendancePrompt, 'future')}
                      disabled={attendanceLoading}
                      className="w-full rounded-lg bg-sparrow-green py-1.5 text-xs font-medium text-white hover:bg-sparrow-green/90"
                    >
                      This and all future occurrences
                    </button>
                    <button
                      onClick={() => setAttendancePrompt(null)}
                      disabled={attendanceLoading}
                      className="w-full py-1 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {(() => {
                const goingIds = attendees.filter((a) => a.status === 'attending').map((a) => a.staff_id);
                const names = goingIds
                  .filter((id) => id !== currentUserId)
                  .map((id) => profiles.find((p) => p.id === id)?.full_name)
                  .filter(Boolean);
                return names.length > 0 ? (
                  <p className="mt-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                    Also attending: {names.join(', ')}
                  </p>
                ) : null;
              })()}
            </div>
          )}

          {/* Invite someone outside Sparrow — available on any event, personal included */}
          {canEdit && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
                  Outside guests
                </p>
                {externalInvites.length > 0 && (
                  <span className="rounded-full bg-sparrow-gold/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    External guest invited
                  </span>
                )}
              </div>

              {externalInvites.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {externalInvites.map((inv) => (
                    <li key={inv.id} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                      Invited {inv.invited_email} &middot; {new Date(inv.created_at).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              )}

              {inviteSent && (
                <p className="mt-1.5 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
                  Invite sent to {inviteSent} ✓
                </p>
              )}

              {inviteOpen ? (
                <div className="mt-2 space-y-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border p-2.5">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="their.email@example.com"
                    className="field-input mt-0 text-sm"
                    autoFocus
                  />
                  <textarea
                    value={inviteNote}
                    onChange={(e) => setInviteNote(e.target.value)}
                    placeholder="Personal note (optional)"
                    rows={2}
                    className="field-input mt-0 resize-none text-sm"
                  />
                  {inviteError && <p className="text-xs text-priority-p1">{inviteError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setInviteOpen(false); setInviteError(null); }}
                      className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void sendExternalInvite()}
                      disabled={!inviteEmail.trim() || invitePending}
                      className="rounded-lg bg-sparrow-green px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {invitePending ? 'Sending…' : 'Send invite'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setInviteOpen(true)}
                  className="mt-1.5 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                >
                  + Invite someone outside Sparrow
                </button>
              )}
            </div>
          )}

          {notesPreview && (notesPreview.prep || notesPreview.live || notesPreview.shared) && (
            <div className="space-y-3">
              {notesPreview.prep && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Prep Notes</p>
                  <div
                    className="mt-1.5 max-h-36 overflow-y-auto rounded-lg bg-amber-50 dark:bg-amber-500/10 p-3 text-sm leading-relaxed text-sparrow-ink dark:text-sparrow-dark-ink [&_b]:font-semibold [&_li]:mb-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4"
                    dangerouslySetInnerHTML={{ __html: notesPreview.prep }}
                  />
                </div>
              )}
              {notesPreview.live && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green dark:text-sparrow-dark-green">Live Notes</p>
                  <div
                    className="mt-1.5 max-h-36 overflow-y-auto rounded-lg bg-green-50 dark:bg-green-500/10 p-3 text-sm leading-relaxed text-sparrow-ink dark:text-sparrow-dark-ink [&_b]:font-semibold [&_li]:mb-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4"
                    dangerouslySetInnerHTML={{ __html: notesPreview.live }}
                  />
                </div>
              )}
              {notesPreview.shared && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Shared Notes</p>
                  <div
                    className="mt-1.5 max-h-36 overflow-y-auto rounded-lg bg-blue-50 dark:bg-blue-500/10 p-3 text-sm leading-relaxed text-sparrow-ink dark:text-sparrow-dark-ink [&_b]:font-semibold [&_li]:mb-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4"
                    dangerouslySetInnerHTML={{ __html: notesPreview.shared }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Comments</p>
            <ul className="mt-2 space-y-3">
              {eventComments.length === 0 && (
                <li className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No comments yet.</li>
              )}
              {eventComments.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{c.author?.full_name ?? 'Staff'}</span>
                  <span className="ml-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                  <p className="text-sparrow-ink dark:text-sparrow-dark-ink">{c.body}</p>
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
