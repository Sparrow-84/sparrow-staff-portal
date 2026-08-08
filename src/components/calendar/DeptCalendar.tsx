import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchCalendar,
  fetchEventIdsWithSharedNotes,
  KIND_LABEL,
  KIND_PILL,
  type CalendarEvent,
} from '@/lib/calendar';
import { LABEL_COLORS } from '@/components/LabelPill';

function eventPillClass(ev: CalendarEvent): string {
  if (ev.label?.color) {
    const meta = LABEL_COLORS.find((c) => c.id === ev.label!.color);
    if (meta) return meta.pill;
  }
  return KIND_PILL[ev.kind];
}
import { fetchProfiles } from '@/lib/data';
import type { Department, Profile } from '@/lib/types';
import { AddOrgEventPanel } from './AddOrgEventPanel';
import { OrgEventDetailPanel } from './OrgEventDetailPanel';
import { MeetingNotesView } from './MeetingNotesView';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

interface TooltipState { title: string; sub?: string; time?: string; x: number; y: number; }

type MultiDayBar = {
  event: CalendarEvent;
  startCol: number;
  span: number;
  lane: number;
  isActualStart: boolean;
  isActualEnd: boolean;
};

interface Props {
  department: Department;
}

export function DeptCalendar({ department }: Props) {
  const { profile } = useAuth();
  const today = new Date();
  const todayStr = localISO(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [notedEventIds, setNotedEventIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState(todayStr);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [notesEvent, setNotesEvent] = useState<CalendarEvent | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [evs, profs, noted] = await Promise.all([fetchCalendar(), fetchProfiles(), fetchEventIdsWithSharedNotes()]);
      setEvents(evs);
      setProfiles(profs);
      setNotedEventIds(noted);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Filter to this dept only — no personal, no all-staff. LCP Session Cal
  // entries are real calendar_events rows (synced via DB trigger) by this
  // point, so they need no special-casing here.
  const deptEvents = useMemo(
    () => events.filter((ev) => ev.department === department && !ev.is_personal),
    [events, department],
  );

  // Build grid days — includes real leading/trailing days from the adjacent
  // months (not blank filler) so the last/first week row previews what's
  // just off-screen, same pattern as LcpCalendar/TaskCalendarView.
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const days: Date[] = [];
  for (let i = firstDow - 1; i >= 0; i--) days.push(new Date(year, month, -i));
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, days.length - daysInMonth - firstDow + 1));
  }

  // Partition into single-day map and multi-day array. Not restricted to the
  // current month — adjacent-month days in the grid need their events too.
  const singleDayByDate = new Map<string, CalendarEvent[]>();
  const visibleMultiDay: CalendarEvent[] = [];
  for (const ev of deptEvents) {
    const startD = ev.all_day ? ev.starts_at.slice(0, 10) : localISO(new Date(ev.starts_at));
    const endD = ev.all_day && ev.ends_at ? ev.ends_at.slice(0, 10) : startD;
    if (ev.all_day && endD > startD) {
      visibleMultiDay.push(ev);
    } else {
      if (!singleDayByDate.has(startD)) singleDayByDate.set(startD, []);
      singleDayByDate.get(startD)!.push(ev);
    }
  }
  for (const arr of singleDayByDate.values()) arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  function getBarsForWeek(week: Date[]): MultiDayBar[] {
    const weekDates = week.map(localISO);
    const weekStart = weekDates[0];
    const weekEnd = weekDates[weekDates.length - 1];

    type Raw = Omit<MultiDayBar, 'lane'>;
    const raw: Raw[] = [];
    for (const ev of visibleMultiDay) {
      const evStart = ev.starts_at.slice(0, 10);
      const evEnd = ev.ends_at!.slice(0, 10);
      if (evEnd < weekStart || evStart > weekEnd) continue;
      let startCol = 0;
      for (let c = 0; c < 7; c++) {
        if (weekDates[c] >= evStart) { startCol = c; break; }
      }
      let endCol = 6;
      for (let c = 6; c >= 0; c--) {
        if (weekDates[c] <= evEnd) { endCol = c; break; }
      }
      raw.push({ event: ev, startCol, span: endCol - startCol + 1, isActualStart: evStart >= weekStart, isActualEnd: evEnd <= weekEnd });
    }
    raw.sort((a, b) => b.span - a.span || a.startCol - b.startCol);
    const laneEnds: number[] = [];
    return raw.map((bar) => {
      let lane = laneEnds.findIndex((end) => end < bar.startCol);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = bar.startCol + bar.span - 1;
      return { ...bar, lane };
    });
  }

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1);
  }
  function openAdd(dStr: string) { setAddDate(dStr); setAddOpen(true); }

  const currentUserId = profile?.id ?? '';
  const isAdmin = profile?.role === 'admin';

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-sparrow-rule px-4 py-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={prevMonth}
            className="grid h-7 w-7 place-items-center rounded-md text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
            aria-label="Previous month"
          >←</button>
          <span className="min-w-[10rem] text-center text-sm font-semibold text-sparrow-ink">
            {MONTHS[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="grid h-7 w-7 place-items-center rounded-md text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
            aria-label="Next month"
          >→</button>
          <button
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            className="rounded-md border border-sparrow-rule px-2 py-0.5 text-xs text-sparrow-gray hover:text-sparrow-ink"
          >
            Today
          </button>
        </div>
        <button onClick={() => openAdd(todayStr)} className="btn-primary text-sm">
          + Add event
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="p-8 text-sm text-sparrow-gray">Loading…</p>
        ) : (
          <div className="border-l border-t border-sparrow-rule">
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7">
              {DOW.map((d) => (
                <div key={d} className="border-b border-r border-sparrow-rule bg-sparrow-mist px-2 py-1.5 text-center text-xs font-semibold text-sparrow-gray">
                  {d}
                </div>
              ))}
            </div>

            {/* Week rows */}
            {weeks.map((week, wi) => {
              const bars = getBarsForWeek(week);
              const numLanes = bars.length > 0 ? Math.max(...bars.map((b) => b.lane)) + 1 : 0;
              const barAreaPx = numLanes > 0 ? 4 + numLanes * 22 : 0;

              return (
                <div key={wi} className="relative">
                  {/* Multi-day bars */}
                  {bars.map((bar, bi) => (
                    <button
                      key={`bar-${bi}`}
                      onClick={() => setDetailEvent(bar.event)}
                      onMouseEnter={(e) => setTooltip({ title: bar.event.title, sub: bar.event.label?.name ?? KIND_LABEL[bar.event.kind], x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        position: 'absolute',
                        top: 4 + bar.lane * 22,
                        left: `calc(${bar.startCol / 7 * 100}% + 2px)`,
                        width: `calc(${bar.span / 7 * 100}% - 4px)`,
                        height: 20,
                        borderRadius: bar.isActualStart && bar.isActualEnd ? 4 : bar.isActualStart ? '4px 0 0 4px' : bar.isActualEnd ? '0 4px 4px 0' : 0,
                      }}
                      className={`z-10 flex items-center gap-1 px-1.5 text-left text-[10px] font-medium leading-5 transition hover:opacity-75 ${eventPillClass(bar.event)}`}
                    >
                      <span className="min-w-0 truncate">{bar.isActualStart ? bar.event.title : ''}</span>
                      {bar.isActualStart && notedEventIds.has(bar.event.id) && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-black/40 bg-white" aria-hidden />
                      )}
                    </button>
                  ))}

                  <div className="grid grid-cols-7">
                    {week.map((day, col) => {
                      const dStr = localISO(day);
                      const inMonth = day.getMonth() === month;
                      const dayEvents = singleDayByDate.get(dStr) ?? [];
                      const isToday = dStr === todayStr;
                      const isPast = dStr < todayStr;
                      const isExpanded = expandedDays.has(dStr);
                      const shown = isExpanded ? dayEvents : dayEvents.slice(0, 3);
                      const overflow = dayEvents.length - shown.length;

                      return (
                        <div
                          key={`${dStr}-${col}`}
                          className={`group min-h-[6rem] border-b border-r border-sparrow-rule p-1 ${!inMonth || isPast ? 'bg-sparrow-mist/30' : ''}`}
                          style={barAreaPx > 0 ? { paddingTop: barAreaPx + 4 } : undefined}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${isToday ? 'bg-sparrow-green text-white' : !inMonth ? 'text-sparrow-rule' : isPast ? 'text-sparrow-gray' : 'text-sparrow-ink'}`}>
                              {day.getDate()}
                            </span>
                            <button
                              onClick={() => openAdd(dStr)}
                              className="hidden rounded px-1 text-sm leading-none text-sparrow-gray hover:text-sparrow-green group-hover:block"
                              aria-label={`Add event on ${dStr}`}
                            >+</button>
                          </div>
                          <div className={`mt-1 space-y-0.5 ${isPast ? 'opacity-60' : ''}`}>
                            {shown.map((ev) => (
                              <button
                                key={ev.id}
                                onClick={() => setDetailEvent(ev)}
                                onMouseEnter={(e) => setTooltip({ title: ev.title, sub: ev.label?.name ?? KIND_LABEL[ev.kind], time: ev.all_day ? undefined : shortTime(ev.starts_at), x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setTooltip(null)}
                                className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition hover:opacity-75 ${eventPillClass(ev)}`}
                              >
                                <span className="min-w-0 truncate">
                                  {ev.all_day ? '' : `${shortTime(ev.starts_at)} · `}{ev.title}
                                </span>
                                {notedEventIds.has(ev.id) && (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-black/40 bg-white" aria-hidden />
                                )}
                              </button>
                            ))}
                            {overflow > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedDays((prev) => new Set(prev).add(dStr))}
                                className="w-full pl-1 text-left text-[10px] font-medium text-sparrow-green hover:underline"
                              >
                                +{overflow} more
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 w-48 rounded-lg border border-sparrow-rule bg-white p-3 shadow-lg"
          style={{ left: tooltip.x > window.innerWidth - 220 ? tooltip.x - 204 : tooltip.x + 14, top: tooltip.y + 16 }}
        >
          <p className="text-sm font-medium text-sparrow-ink">{tooltip.title}</p>
          {tooltip.sub && <p className="mt-0.5 text-xs text-sparrow-gray">{tooltip.sub}</p>}
          {tooltip.time && <p className="mt-0.5 text-xs text-sparrow-gray">{tooltip.time}</p>}
        </div>
      )}

      {/* Panels */}
      <AddOrgEventPanel
        open={addOpen}
        defaultDate={addDate}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        userDepts={[department]}
        profiles={profiles}
        initialDept={department}
        initialPersonal={false}
        onClose={() => setAddOpen(false)}
        onCreated={() => { setAddOpen(false); void load(); }}
      />
      <OrgEventDetailPanel
        event={detailEvent}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        profiles={profiles}
        onClose={() => setDetailEvent(null)}
        onDeleted={() => { setDetailEvent(null); void load(); }}
        onUpdated={() => void load()}
        onOpenNotes={(ev) => { setDetailEvent(null); setNotesEvent(ev); }}
      />
      {notesEvent && profile && (
        <MeetingNotesView
          event={notesEvent}
          userId={profile.id}
          onClose={() => setNotesEvent(null)}
        />
      )}
    </div>
  );
}
