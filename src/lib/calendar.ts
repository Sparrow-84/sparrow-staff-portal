import { supabase } from './supabase';
import type { Department, OfficeRoom } from './types';

// ── Calendar labels ───────────────────────────────────────────────────

export type LabelScope = 'preset' | 'all_staff' | 'dept' | 'personal';

export interface CalendarLabel {
  id: string;
  name: string;
  color: string;       // matches a LABEL_COLORS id ('green', 'blue', 'lime', etc.)
  scope: LabelScope;
  department: Department | null;
  is_preset: boolean;
  sort_order: number;
  created_by: string | null;
}

/** Multi-layer mode: event pill color is determined by its source layer, not its label. */
export const LAYER_PILL: Record<string, string> = {
  all_staff:    'bg-emerald-600 text-white',
  personal:     'bg-violet-500 text-white',
  toc:          'bg-teal-600 text-white',
  lcp:          'bg-blue-600 text-white',
  partnerships: 'bg-amber-500 text-white',
  ops:          'bg-rose-500 text-white',
};

export function getLayerPill(ev: { is_personal: boolean; department: Department | null }): string {
  if (ev.is_personal) return LAYER_PILL.personal;
  if (!ev.department) return LAYER_PILL.all_staff;
  return LAYER_PILL[ev.department] ?? LAYER_PILL.all_staff;
}

export async function fetchCalendarLabels(): Promise<CalendarLabel[]> {
  const { data, error } = await supabase
    .from('calendar_labels')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return []; // table may not exist until 0065 is applied
  return (data ?? []) as CalendarLabel[];
}

export async function createCalendarLabel(input: {
  name: string;
  color: string;
  scope: LabelScope;
  department?: Department | null;
  created_by: string;
}): Promise<CalendarLabel> {
  const { data, error } = await supabase
    .from('calendar_labels')
    .insert({
      name: input.name,
      color: input.color,
      scope: input.scope,
      department: input.department ?? null,
      created_by: input.created_by,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CalendarLabel;
}

export async function updateCalendarLabel(id: string, patch: { name?: string; color?: string }): Promise<void> {
  const { error } = await supabase.from('calendar_labels').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteCalendarLabel(id: string): Promise<void> {
  const { error } = await supabase.from('calendar_labels').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Event comments ────────────────────────────────────────────────────

export interface EventComment {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { full_name: string } | null;
}

export async function fetchEventComments(eventId: string): Promise<EventComment[]> {
  const { data, error } = await supabase
    .from('event_comments')
    .select('*, author:profiles!event_comments_author_id_fkey(full_name)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EventComment[];
}

export async function addEventComment(eventId: string, body: string, authorId: string): Promise<void> {
  const { error } = await supabase
    .from('event_comments')
    .insert({ event_id: eventId, author_id: authorId, body });
  if (error) throw new Error(error.message);
}

export async function notifyEventCommentMentions(
  mentionedIds: string[],
  actorId: string,
  eventId: string,
  body: string,
): Promise<void> {
  if (!mentionedIds.length) return;
  const { error } = await supabase.rpc('event_comment_notify_mentions', {
    p_mentioned_ids: mentionedIds,
    p_actor_id: actorId,
    p_event_id: eventId,
    p_body: body,
  });
  if (error) throw new Error(error.message);
}

export function withTzOffset(dateStr: string, timeStr: string): string {
  const d = new Date(`${dateStr}T${timeStr}:00`);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const mm = String(Math.abs(offset) % 60).padStart(2, '0');
  return `${dateStr}T${timeStr}:00${sign}${hh}:${mm}`;
}

// Supabase returns timestamptz as UTC (e.g. "2026-07-01T16:00:00Z").
// These helpers extract the correct local date/time using the browser's timezone.
export function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type CalendarKind = 'meeting' | 'closure' | 'holiday' | 'ooo' | 'lcp_session' | 'toc' | 'other';

export interface CalendarEvent {
  id: string;
  kind: CalendarKind;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  recurrence: string | null; // null | 'weekly' | 'biweekly' (legacy field)
  recurrence_id: string | null; // groups recurring series created with the new UI
  department: Department | null;
  is_personal: boolean;
  created_by: string | null;
  created_at: string;
  room_id: string | null;
  is_private_meeting: boolean;
  office_room: { name: string } | null;
  label_id: string | null;
  label: CalendarLabel | null;
}

export interface EventOccurrence {
  event: CalendarEvent;
  occursAt: Date;
}

export const KIND_PILL: Record<CalendarKind, string> = {
  meeting:     'bg-slate-500 text-white',
  closure:     'bg-priority-p1 text-white',
  holiday:     'bg-sparrow-green text-white',
  ooo:         'bg-sparrow-gray text-white',
  lcp_session: 'bg-blue-600 text-white',
  toc:         'bg-teal-600 text-white',
  other:       'bg-sparrow-gold text-sparrow-ink',
};

export const KIND_LABEL: Record<CalendarKind, string> = {
  meeting:     'Meeting',
  closure:     'Office closed',
  holiday:     'Holiday',
  ooo:         'Out of office',
  lcp_session: 'LCP',
  toc:         'TOC',
  other:       'Org event',
};

/** Kinds available when creating an org-wide event. */
export const ADD_KINDS: { value: CalendarKind; label: string }[] = [
  { value: 'other',   label: 'Org event' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'closure', label: 'Office closed' },
];

export interface CalendarEventInput {
  kind: CalendarKind;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  recurrence_id: string | null;
  created_by: string;
  department?: Department | null;
  is_personal?: boolean;
  room_id?: string | null;
  is_private_meeting?: boolean;
  label_id?: string | null;
}

export async function createCalendarEvents(inputs: CalendarEventInput[]): Promise<string[]> {
  // recurrence_id is omitted from non-recurring rows until migration 0035 is applied;
  // once the column exists, recurring events include it so series deletes work.
  const rows = inputs.map(({ recurrence_id, department, is_personal, room_id, is_private_meeting, label_id, ...rest }) => {
    const row: Record<string, unknown> = { ...rest };
    if (recurrence_id) row.recurrence_id = recurrence_id;
    if (department) row.department = department;
    if (is_personal) row.is_personal = true;
    if (room_id) row.room_id = room_id;
    if (is_private_meeting) row.is_private_meeting = true;
    if (label_id) row.label_id = label_id;
    return row;
  });
  const { data, error } = await supabase.from('calendar_events').insert(rows).select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id as string);
}

// ── Attendance / RSVP ────────────────────────────────────────────────

export interface EventAttendee {
  event_id: string;
  staff_id: string;
  status: 'attending' | 'opted_out';
  added_by: string | null;
  created_at: string;
}

/** Fetch all attendance rows for a specific event (for the detail panel). */
export async function fetchEventAttendees(eventId: string): Promise<EventAttendee[]> {
  const { data, error } = await supabase
    .from('event_attendees')
    .select('*')
    .eq('event_id', eventId);
  // Table may not exist yet (migration pending) — degrade gracefully
  if (error) return [];
  return (data ?? []) as EventAttendee[];
}

/** Fetch the current user's attendance rows across all events (for widget filtering). */
export async function fetchMyAttendance(userId: string): Promise<EventAttendee[]> {
  const { data, error } = await supabase
    .from('event_attendees')
    .select('*')
    .eq('staff_id', userId);
  // Table may not exist yet (migration pending) — degrade gracefully
  if (error) return [];
  return (data ?? []) as EventAttendee[];
}

/** Set current user's own attendance status (upsert). */
export async function setMyAttendance(
  eventId: string,
  userId: string,
  status: 'attending' | 'opted_out',
): Promise<void> {
  const { error } = await supabase
    .from('event_attendees')
    .upsert({ event_id: eventId, staff_id: userId, status, added_by: userId });
  if (error) throw new Error(error.message);
}

/** Remove an attendance row (self opt-back-to-default, or creator removing someone). */
export async function removeAttendee(eventId: string, staffId: string): Promise<void> {
  const { error } = await supabase
    .from('event_attendees')
    .delete()
    .eq('event_id', eventId)
    .eq('staff_id', staffId);
  if (error) throw new Error(error.message);
}

/**
 * Creator adds a list of staff as attendees across all event IDs in a series.
 * Sends one notification per attendee (not per occurrence).
 */
export async function addEventAttendees(
  eventIds: string[],
  eventTitle: string,
  staffIds: string[],
  actorId: string,
): Promise<void> {
  const rows = eventIds.flatMap((eid) =>
    staffIds.map((sid) => ({ event_id: eid, staff_id: sid, status: 'attending' as const, added_by: actorId })),
  );
  const { error } = await supabase.from('event_attendees').upsert(rows);
  if (error) throw new Error(error.message);

  const toNotify = staffIds.filter((id) => id !== actorId);
  if (toNotify.length > 0) {
    await supabase.rpc('notify_event_attendees', {
      p_staff_ids: toNotify,
      p_actor_id: actorId,
      p_event_id: eventIds[0],
      p_event_title: eventTitle,
      p_notification_type: 'event_invited',
    });
  }
}

/**
 * Notify all staff (except the creator) that a new All Staff meeting/event was posted,
 * so they can RSVP inline from the notification instead of having to open the event
 * to opt out of the default "attending" status.
 */
export async function notifyNewAllStaffEvent(
  eventId: string,
  eventTitle: string,
  staffIds: string[],
  actorId: string,
): Promise<void> {
  const toNotify = staffIds.filter((id) => id !== actorId);
  if (!toNotify.length) return;
  const { error } = await supabase.rpc('notify_event_attendees', {
    p_staff_ids: toNotify,
    p_actor_id: actorId,
    p_event_id: eventId,
    p_event_title: eventTitle,
    p_notification_type: 'event_created',
  });
  if (error) throw new Error(error.message);
}

/** Creator removes a staff member from all events in a series and notifies them. */
export async function removeEventAttendee(
  eventIds: string[],
  eventTitle: string,
  staffId: string,
  actorId: string,
): Promise<void> {
  for (const eid of eventIds) {
    await removeAttendee(eid, staffId);
  }
  if (staffId !== actorId) {
    await supabase.rpc('notify_event_attendees', {
      p_staff_ids: [staffId],
      p_actor_id: actorId,
      p_event_id: eventIds[0],
      p_event_title: eventTitle,
      p_notification_type: 'event_removed',
    });
  }
}

export async function updateCalendarEvent(
  id: string,
  patch: Partial<Pick<CalendarEvent, 'kind' | 'title' | 'starts_at' | 'ends_at' | 'all_day' | 'location' | 'label_id'>>,
): Promise<void> {
  const { error } = await supabase.from('calendar_events').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateCalendarEventAndFuture(
  recurrenceId: string,
  fromStartsAt: string,
  fields: Partial<Pick<CalendarEvent, 'kind' | 'title' | 'all_day' | 'location'>>,
  startTime?: string,
  endTime?: string | null,
  dateDeltaMs?: number,
): Promise<void> {
  if (Object.keys(fields).length > 0) {
    const { error } = await supabase
      .from('calendar_events')
      .update(fields)
      .eq('recurrence_id', recurrenceId)
      .gte('starts_at', fromStartsAt);
    if (error) throw new Error(error.message);
  }

  if (startTime !== undefined || dateDeltaMs) {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('id, starts_at, ends_at')
      .eq('recurrence_id', recurrenceId)
      .gte('starts_at', fromStartsAt);
    if (error) throw new Error(error.message);

    // Shift each occurrence's date by the same delta the edited event moved by
    // (so the rest of the series keeps its own relative time), then reapply a
    // time-of-day change on top if one was made.
    const updates = (data ?? []).map((row) => {
      const shiftedStartsAt = dateDeltaMs
        ? new Date(new Date(row.starts_at).getTime() + dateDeltaMs).toISOString()
        : row.starts_at;
      if (startTime !== undefined) {
        return {
          id: row.id,
          starts_at: withTzOffset(toLocalDate(shiftedStartsAt), startTime),
          ends_at: endTime ? withTzOffset(toLocalDate(shiftedStartsAt), endTime) : null,
        };
      }
      const shiftedEndsAt =
        dateDeltaMs && row.ends_at ? new Date(new Date(row.ends_at).getTime() + dateDeltaMs).toISOString() : row.ends_at;
      return { id: row.id, starts_at: shiftedStartsAt, ends_at: shiftedEndsAt };
    });

    // Use individual UPDATEs — upsert triggers the INSERT RLS check (requires created_by)
    // even when the row already exists, causing a policy violation.
    await Promise.all(updates.map(u =>
      supabase.from('calendar_events')
        .update({ starts_at: u.starts_at, ends_at: u.ends_at })
        .eq('id', u.id)
        .then(({ error }) => { if (error) throw new Error(error.message); })
    ));
  }
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteCalendarEventAndFuture(recurrenceId: string, fromStartsAt: string): Promise<void> {
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('recurrence_id', recurrenceId)
    .gte('starts_at', fromStartsAt);
  if (error) throw new Error(error.message);
}

export async function fetchOfficeRooms(): Promise<OfficeRoom[]> {
  const { data, error } = await supabase
    .from('office_rooms')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) return []; // graceful if migration not yet applied
  return (data ?? []) as OfficeRoom[];
}

/** Returns true if the given room is already booked during [startsAt, endsAt]. */
export async function checkRoomConflict(
  roomId: string,
  startsAt: string,
  endsAt: string,
  excludeEventId?: string,
): Promise<boolean> {
  let q = supabase
    .from('calendar_events')
    .select('id')
    .eq('room_id', roomId)
    .lt('starts_at', endsAt)
    .gt('ends_at', startsAt);
  if (excludeEventId) q = q.neq('id', excludeEventId);
  const { data } = await q;
  return (data?.length ?? 0) > 0;
}

/** Returns true if there is a private Resident Services booking during [startsAt, endsAt]. */
export async function checkWholeOfficeBlocked(
  startsAt: string,
  endsAt: string,
  excludeEventId?: string,
): Promise<boolean> {
  let q = supabase
    .from('calendar_events')
    .select('id, office_room:room_id(blocks_whole_office)')
    .eq('is_private_meeting', true)
    .lt('starts_at', endsAt)
    .gt('ends_at', startsAt);
  if (excludeEventId) q = q.neq('id', excludeEventId);
  const { data } = await q;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).some((r: any) => {
    const room = Array.isArray(r.office_room) ? r.office_room[0] : r.office_room;
    return room?.blocks_whole_office === true;
  });
}

export async function fetchCalendar(): Promise<CalendarEvent[]> {
  try {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*, office_room:room_id(name), label:label_id(id, name, color, scope, department, is_preset, sort_order, created_by)')
      .order('starts_at');
    if (error) throw error;
    return (data ?? []) as unknown as CalendarEvent[];
  } catch {
    // label_id column may not exist until migration 0065 is applied — degrade gracefully
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*, office_room:room_id(name)')
      .order('starts_at');
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as CalendarEvent[]).map((ev) => ({ ...ev, label_id: null, label: null }));
  }
}

/**
 * Expand recurring events into concrete occurrences within [from, to]. One-off events
 * are included when their start falls in range; weekly/biweekly events are stepped
 * forward from their anchor. (Times use millisecond arithmetic — a recurrence that
 * crosses a DST boundary may shift by an hour, acceptable for the schedule view.)
 */
export function expandEvents(events: CalendarEvent[], from: Date, to: Date): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  for (const ev of events) {
    const base = new Date(ev.starts_at);
    const stepDays = ev.recurrence === 'weekly' ? 7 : ev.recurrence === 'biweekly' ? 14 : 0;
    if (stepDays === 0) {
      if (base >= from && base <= to) out.push({ event: ev, occursAt: base });
      continue;
    }
    const step = stepDays * 86_400_000;
    let t = base.getTime();
    if (t < from.getTime()) {
      const periods = Math.ceil((from.getTime() - t) / step);
      t += periods * step;
    }
    while (t <= to.getTime()) {
      if (t >= from.getTime()) out.push({ event: ev, occursAt: new Date(t) });
      t += step;
    }
  }
  out.sort((a, b) => a.occursAt.getTime() - b.occursAt.getTime());
  return out;
}
