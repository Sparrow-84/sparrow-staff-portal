import { supabase } from './supabase';
import type { Department } from './types';

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
}

export async function createCalendarEvents(inputs: CalendarEventInput[]): Promise<void> {
  // recurrence_id is omitted from non-recurring rows until migration 0035 is applied;
  // once the column exists, recurring events include it so series deletes work.
  const rows = inputs.map(({ recurrence_id, ...rest }) =>
    recurrence_id ? { ...rest, recurrence_id } : rest,
  );
  const { error } = await supabase.from('calendar_events').insert(rows);
  if (error) throw new Error(error.message);
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
