import { supabase } from './supabase';
import type { Department } from './types';

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
  created_by: string | null;
  created_at: string;
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
}

export async function createCalendarEvents(inputs: CalendarEventInput[]): Promise<void> {
  // recurrence_id is omitted from non-recurring rows until migration 0035 is applied;
  // once the column exists, recurring events include it so series deletes work.
  const rows = inputs.map(({ recurrence_id, department, ...rest }) => {
    const row: Record<string, unknown> = { ...rest };
    if (recurrence_id) row.recurrence_id = recurrence_id;
    if (department) row.department = department;
    return row;
  });
  const { error } = await supabase.from('calendar_events').insert(rows);
  if (error) throw new Error(error.message);
}

export async function updateCalendarEvent(
  id: string,
  patch: Partial<Pick<CalendarEvent, 'kind' | 'title' | 'starts_at' | 'ends_at' | 'all_day' | 'location'>>,
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
): Promise<void> {
  if (Object.keys(fields).length > 0) {
    const { error } = await supabase
      .from('calendar_events')
      .update(fields)
      .eq('recurrence_id', recurrenceId)
      .gte('starts_at', fromStartsAt);
    if (error) throw new Error(error.message);
  }

  if (startTime !== undefined) {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('id, starts_at')
      .eq('recurrence_id', recurrenceId)
      .gte('starts_at', fromStartsAt);
    if (error) throw new Error(error.message);

    const updates = (data ?? []).map(row => ({
      id: row.id,
      starts_at: withTzOffset(toLocalDate(row.starts_at), startTime),
      ends_at: endTime ? withTzOffset(toLocalDate(row.starts_at), endTime) : null,
    }));

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

export async function fetchCalendar(): Promise<CalendarEvent[]> {
  const { data, error } = await supabase.from('calendar_events').select('*').order('starts_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as CalendarEvent[];
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
