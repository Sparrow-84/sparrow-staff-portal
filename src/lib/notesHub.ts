import { supabase } from './supabase';
import { fetchMyAttendance, type CalendarEvent, type EventAttendee } from './calendar';

const EVENT_SELECT =
  '*, office_room:room_id(name), label:label_id(id, name, color, scope, department, is_preset, sort_order, created_by), creator:profiles!calendar_events_created_by_fkey(id, full_name)';

export interface MyNoteEntry {
  event: CalendarEvent;
  updated_at: string;
}

export interface SharedNoteEntry {
  event: CalendarEvent;
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

function sortByEventDate<T extends { event: CalendarEvent }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime());
}

/** Every event where the current user has written private prep/live notes — past, present, or future. */
export async function fetchMyNotesIndex(userId: string): Promise<MyNoteEntry[]> {
  const { data, error } = await supabase
    .from('meeting_notes')
    .select(`prep_notes, live_notes, updated_at, event:calendar_events(${EVENT_SELECT})`)
    .eq('user_id', userId);
  if (error) return []; // table may not exist yet — degrade gracefully

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  return sortByEventDate(
    rows
      .filter((r) => r.event && (r.prep_notes?.trim() || r.live_notes?.trim()))
      .map((r) => ({ event: r.event as CalendarEvent, updated_at: r.updated_at as string })),
  );
}

/** Shared notes on events the user has attended or will attend. */
export async function fetchSharedNotesIndex(userId: string): Promise<SharedNoteEntry[]> {
  const [{ data, error }, attendanceRows] = await Promise.all([
    supabase
      .from('event_shared_notes')
      .select(
        `updated_at, updated_by, event:calendar_events(${EVENT_SELECT}), updater:profiles!event_shared_notes_updated_by_fkey(full_name)`,
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
      .filter((r) => r.event && isAttendingEvent(r.event as CalendarEvent, attendance))
      .map((r) => ({
        event: r.event as CalendarEvent,
        updated_at: r.updated_at as string,
        updatedByName: r.updater?.full_name ?? null,
      })),
  );
}
