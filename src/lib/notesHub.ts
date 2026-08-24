import { supabase } from './supabase';
import { fetchMyAttendance, type CalendarEvent, type EventAttendee } from './calendar';
import type { Department } from './types';

const EVENT_SELECT =
  '*, office_room:room_id(name), label:label_id(id, name, color, scope, department, is_preset, sort_order, created_by), creator:profiles!calendar_events_created_by_fkey(id, full_name)';

export interface MyNoteEntry {
  noteId: string;
  event: CalendarEvent | null; // null once the meeting has been deleted
  title: string;
  startsAt: string;
  updated_at: string;
  department: Department | null; // effective, after any personal override
  hasOverride: boolean;
}

export interface SharedNoteEntry {
  noteId: string;
  event: CalendarEvent | null; // null once the meeting has been deleted
  title: string;
  startsAt: string;
  updated_at: string;
  updatedByName: string | null;
  department: Department | null;
  hasOverride: boolean;
}

/** This user's personal "file this event's notes under X instead" overrides, keyed by event_id.
 * Doesn't touch the event's real department — only changes how that event's notes are
 * bucketed in this person's own Calendar Notes filter. See 0168 for why this exists:
 * a cross-functional meeting filed under one department for calendar-routing reasons
 * isn't necessarily "that department's business" for everyone who was in it. */
export async function fetchDepartmentOverrides(userId: string): Promise<Map<string, Department | null>> {
  const { data, error } = await supabase
    .from('note_department_overrides')
    .select('event_id, department')
    .eq('user_id', userId);
  if (error) return new Map();
  return new Map((data ?? []).map((r) => [r.event_id as string, r.department as Department | null]));
}

export async function setDepartmentOverride(eventId: string, userId: string, department: Department | null): Promise<void> {
  const { error } = await supabase
    .from('note_department_overrides')
    .upsert({ event_id: eventId, user_id: userId, department });
  if (error) throw new Error(error.message);
}

export async function clearDepartmentOverride(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('note_department_overrides')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

function effectiveDepartment(
  event: CalendarEvent | null,
  overrides: Map<string, Department | null>,
): { department: Department | null; hasOverride: boolean } {
  if (event && overrides.has(event.id)) {
    return { department: overrides.get(event.id) ?? null, hasOverride: true };
  }
  return { department: event?.department ?? null, hasOverride: false };
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
  const [{ data, error }, overrides] = await Promise.all([
    supabase
      .from('meeting_notes')
      .select(`id, prep_notes, live_notes, updated_at, event_title, event_starts_at, event:calendar_events(${EVENT_SELECT})`)
      .eq('user_id', userId),
    fetchDepartmentOverrides(userId),
  ]);
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
          ...effectiveDepartment(event, overrides),
        };
      }),
  );
}

/** Shared notes on events the user has attended or will attend, plus any whose meeting has since been deleted. */
export async function fetchSharedNotesIndex(userId: string): Promise<SharedNoteEntry[]> {
  const [{ data, error }, attendanceRows, overrides] = await Promise.all([
    supabase
      .from('event_shared_notes')
      .select(
        `id, updated_at, updated_by, event_title, event_starts_at, event:calendar_events(${EVENT_SELECT}), updater:profiles!event_shared_notes_updated_by_fkey(full_name)`,
      )
      .neq('notes', ''),
    fetchMyAttendance(userId),
    fetchDepartmentOverrides(userId),
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
          ...effectiveDepartment(event, overrides),
        };
      }),
  );
}
