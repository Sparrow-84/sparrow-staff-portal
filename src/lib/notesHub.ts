import { supabase } from './supabase';
import { fetchMyAttendance, type CalendarEvent, type EventAttendee } from './calendar';

const EVENT_SELECT =
  '*, office_room:room_id(name), label:label_id(id, name, color, scope, department, is_preset, sort_order, created_by), creator:profiles!calendar_events_created_by_fkey(id, full_name)';

export interface MyNoteEntry {
  noteId: string;
  event: CalendarEvent | null; // null once the meeting has been deleted
  title: string;
  startsAt: string;
  updated_at: string;
}

export interface SharedNoteEntry {
  noteId: string;
  event: CalendarEvent | null; // null once the meeting has been deleted
  title: string;
  startsAt: string;
  updated_at: string;
  updatedByName: string | null;
}

/**
 * Same default-attendance rule used across the RSVP system (see calendar.ts):
 * All Staff events default to attending (a row only exists to opt out); dept events
 * default to not attending (a row only exists to opt in); personal events are always yours.
 */
function isAttendingEvent(ev: CalendarEvent, attendance: Map<string, EventAttendee>): boolean {
  if (ev.is_personal) return true;
  const row = attendance.get(ev.id);
  if (!ev.department) return row ? row.status !== 'opted_out' : true;
  return row ? row.status === 'attending' : false;
}

function sortByEventDate<T extends { startsAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

/** Every event where the current user has written private prep/live notes — past, present, or future.
 * Notes whose meeting has since been deleted still show up, labeled with the meeting's last-known title/date. */
export async function fetchMyNotesIndex(userId: string): Promise<MyNoteEntry[]> {
  const { data, error } = await supabase
    .from('meeting_notes')
    .select(`id, prep_notes, live_notes, updated_at, event_title, event_starts_at, event:calendar_events(${EVENT_SELECT})`)
    .eq('user_id', userId);
  if (error) return []; // table may not exist yet — degrade gracefully

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  return sortByEventDate(
    rows
      .filter((r) => r.prep_notes?.trim() || r.live_notes?.trim())
      .map((r) => {
        const event = (r.event as CalendarEvent | null) ?? null;
        return {
          noteId: r.id as string,
          event,
          title: event?.title ?? (r.event_title as string | null) ?? 'Deleted meeting',
          startsAt: event?.starts_at ?? (r.event_starts_at as string | null) ?? (r.updated_at as string),
          updated_at: r.updated_at as string,
        };
      }),
  );
}

/** Shared notes on events the user has attended or will attend, plus any whose meeting has since been deleted. */
export async function fetchSharedNotesIndex(userId: string): Promise<SharedNoteEntry[]> {
  const [{ data, error }, attendanceRows] = await Promise.all([
    supabase
      .from('event_shared_notes')
      .select(
        `id, updated_at, updated_by, event_title, event_starts_at, event:calendar_events(${EVENT_SELECT}), updater:profiles!event_shared_notes_updated_by_fkey(full_name)`,
      )
      .neq('notes', ''),
    fetchMyAttendance(userId),
  ]);
  if (error) return []; // table may not exist yet — degrade gracefully

  const attendance = new Map(attendanceRows.map((a) => [a.event_id, a]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  return sortByEventDate(
    rows
      .filter((r) => (r.event ? isAttendingEvent(r.event as CalendarEvent, attendance) : true))
      .map((r) => {
        const event = (r.event as CalendarEvent | null) ?? null;
        return {
          noteId: r.id as string,
          event,
          title: event?.title ?? (r.event_title as string | null) ?? 'Deleted meeting',
          startsAt: event?.starts_at ?? (r.event_starts_at as string | null) ?? (r.updated_at as string),
          updated_at: r.updated_at as string,
          updatedByName: r.updater?.full_name ?? null,
        };
      }),
  );
}
