import { useCallback, useEffect, useMemo, useState } from 'react';
import { TabHelpModal } from '@/components/TabHelpModal';

const CALENDAR_HELP_SECTIONS = [
  {
    heading: 'Filter layers',
    items: [
      { label: 'All Staff', desc: 'Org-wide events added by admins — team meetings, site visits, program milestones. On by default.' },
      { label: 'My Depts', desc: 'Events from your department rooms. Enable sub-department chips to filter further. LCP sessions appear here when toggled on.' },
      { label: 'Personal', desc: 'Events only you can see — personal reminders, appointments, personal blocks. Nobody else sees these, including admins.' },
      { label: 'Deadlines', desc: 'Your task due dates shown as labeled pills — red for P1, gold for P2, gray for P3/P4.' },
    ],
    note: 'Each layer is independent — toggle any combination. Your settings are remembered.',
  },
  {
    heading: 'Adding events',
    items: [
      { label: '+ Add event button', desc: 'Opens a form to create an org-wide event. Appears on the All Staff layer for every staff member.' },
      { label: 'Click any day', desc: 'Hover a day cell and click the + that appears to add an event pre-filled with that date.' },
    ],
  },
  {
    heading: 'Navigation',
    items: [
      { label: 'Arrows', desc: 'Step forward or back one month.' },
      { label: 'Today button', desc: 'Jump back to the current month instantly.' },
      { label: 'Event detail', desc: 'Click any event to see its details, edit it, or delete it (admin only).' },
    ],
  },
];
import { useAuth } from '@/auth/AuthContext';
import { fetchCalendar, KIND_LABEL, KIND_PILL, type CalendarEvent } from '@/lib/calendar';
import { AddOrgEventPanel } from '@/components/calendar/AddOrgEventPanel';
import { OrgEventDetailPanel } from '@/components/calendar/OrgEventDetailPanel';
import { MeetingNotesView } from '@/components/calendar/MeetingNotesView';
import { fetchOrgCalLcpEvents } from '@/lib/lcp';
import type { LcpEvent } from '@/lib/lcp-types';
import { EVENT_LABEL } from '@/lib/lcp-types';
import { supabase } from '@/lib/supabase';
import type { Department, Priority, Task } from '@/lib/types';
import { DEPARTMENTS } from '@/lib/types';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const DEADLINE_PILL: Record<Priority, string> = {
  p1: 'bg-red-100 text-red-700',
  p2: 'bg-amber-100 text-amber-700',
  p3: 'bg-slate-100 text-slate-600',
  p4: 'bg-slate-100 text-slate-400',
};

// Filter chip styles — each chip is independent, not a radio group
const CHIP_ON  = 'rounded-md border border-sparrow-green bg-sparrow-green px-3 py-1 text-xs font-medium text-white transition';
const CHIP_OFF = 'rounded-md border border-sparrow-rule px-3 py-1 text-xs font-medium text-sparrow-gray transition hover:border-sparrow-gray hover:text-sparrow-ink';

// Dept sub-chip styles (slightly smaller)
const SUB_ON  = 'rounded border border-sparrow-green bg-sparrow-green px-2.5 py-0.5 text-[11px] font-medium text-white transition';
const SUB_OFF = 'rounded border border-sparrow-rule px-2.5 py-0.5 text-[11px] font-medium text-sparrow-gray transition hover:text-sparrow-ink';

type DeadlineTask = Pick<Task, 'id' | 'title' | 'due_date' | 'priority' | 'status' | 'source_system' | 'source_ref'>;

interface CalTooltipState {
  title: string;
  sub?: string;
  time?: string;
  location?: string;
  x: number;
  y: number;
}

function CalTooltip({ s }: { s: CalTooltipState }) {
  const left = s.x > window.innerWidth - 290 ? s.x - 274 : s.x + 14;
  const top = s.y + 16;
  return (
    <div
      className="pointer-events-none fixed z-50 w-56 rounded-lg border border-sparrow-rule bg-white p-3 shadow-lg"
      style={{ left, top }}
    >
      <p className="text-sm font-medium leading-snug text-sparrow-ink">{s.title}</p>
      {s.sub && <p className="mt-1 text-xs text-sparrow-gray">{s.sub}</p>}
      {s.time && <p className="mt-0.5 text-xs text-sparrow-gray">{s.time}</p>}
      {s.location && <p className="mt-0.5 text-xs text-sparrow-gray">{s.location}</p>}
    </div>
  );
}

export function CalendarView() {
  const { profile } = useAuth();
  const today = new Date();
  const todayStr = localISO(today);

  const [year, setYear]       = useState(today.getFullYear());
  const [month, setMonth]     = useState(today.getMonth());
  const [events, setEvents]   = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState(todayStr);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [notesEvent, setNotesEvent] = useState<CalendarEvent | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [calTooltip, setCalTooltip] = useState<CalTooltipState | null>(null);

  // Main layer toggles — each independently on/off, all persisted
  const [showAllStaff, setShowAllStaff] = useState(
    () => localStorage.getItem('calendar_show_all_staff') !== 'false', // default on
  );
  const [showMyDepts, setShowMyDepts] = useState(
    () => localStorage.getItem('calendar_show_my_depts') === 'true',
  );
  const [showDeadlines, setShowDeadlines] = useState(
    () => localStorage.getItem('calendar_show_deadlines') === 'true',
  );
  const [showPersonal, setShowPersonal] = useState(
    () => localStorage.getItem('calendar_show_personal') === 'true',
  );

  // Which dept sub-chips the user has explicitly turned OFF (absent = active)
  const [disabledDepts, setDisabledDepts] = useState<Set<Department>>(() => {
    try {
      const saved = localStorage.getItem('calendar_disabled_depts');
      return saved ? new Set(JSON.parse(saved) as Department[]) : new Set();
    } catch { return new Set(); }
  });

  // Dept chips this profile has access to
  const myDepts = useMemo((): Department[] => {
    if (!profile) return [];
    if (profile.role === 'admin') return ['toc', 'lcp', 'partnerships', 'ops'];
    const set = new Set<Department>([profile.department]);
    if (profile.partnerships_access) set.add('partnerships');
    if (profile.ops_access) set.add('ops');
    if (profile.lcp_role !== null) set.add('lcp');
    return [...set];
  }, [profile]);

  const [deadlineTasks, setDeadlineTasks] = useState<DeadlineTask[]>([]);
  const [lcpOrgEvents, setLcpOrgEvents] = useState<LcpEvent[]>([]);

  const load = useCallback(async () => {
    try { setEvents(await fetchCalendar()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!showDeadlines || !profile?.id) { setDeadlineTasks([]); return; }
    void supabase
      .from('tasks')
      .select('id, title, due_date, priority, status, source_system, source_ref')
      .eq('assignee_id', profile.id)
      .neq('status', 'done')
      .not('due_date', 'is', null)
      .then(({ data }) => setDeadlineTasks((data ?? []) as DeadlineTask[]));
  }, [showDeadlines, profile?.id]);

  // Load LCP events flagged for the org calendar when the LCP dept chip is active
  const lcpChipActive = showMyDepts && myDepts.includes('lcp') && !disabledDepts.has('lcp');
  useEffect(() => {
    if (!lcpChipActive) { setLcpOrgEvents([]); return; }
    void fetchOrgCalLcpEvents()
      .then(setLcpOrgEvents)
      .catch(() => setLcpOrgEvents([])); // graceful: column may not exist until 0039 runs
  }, [lcpChipActive]);

  function toggleAllStaff() {
    setShowAllStaff(v => { const n = !v; localStorage.setItem('calendar_show_all_staff', String(n)); return n; });
  }
  function toggleMyDepts() {
    setShowMyDepts(v => { const n = !v; localStorage.setItem('calendar_show_my_depts', String(n)); return n; });
  }
  function toggleDeadlines() {
    setShowDeadlines(v => { const n = !v; localStorage.setItem('calendar_show_deadlines', String(n)); return n; });
  }
  function togglePersonal() {
    setShowPersonal(v => { const n = !v; localStorage.setItem('calendar_show_personal', String(n)); return n; });
  }
  function toggleDept(dept: Department) {
    setDisabledDepts(prev => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept); else next.add(dept);
      localStorage.setItem('calendar_disabled_depts', JSON.stringify([...next]));
      return next;
    });
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
  }

  // Build grid cells
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startPad = firstDay.getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Partition events: single-day go into a map keyed by date; multi-day all-day events
  // go into a separate array for spanning-bar rendering across the week grid.
  const singleDayByDate = new Map<string, CalendarEvent[]>();
  const visibleMultiDay: CalendarEvent[] = [];
  for (const ev of events) {
    const isPersonal = ev.is_personal;
    const isAllStaff = !isPersonal && ev.department === null;
    const isDept = !isPersonal && ev.department !== null && myDepts.includes(ev.department) && !disabledDepts.has(ev.department);
    if (!(isAllStaff && showAllStaff) && !(isDept && showMyDepts) && !(isPersonal && showPersonal)) continue;

    const startD = localISO(new Date(ev.starts_at));
    const endD = ev.all_day && ev.ends_at ? localISO(new Date(ev.ends_at)) : startD;

    if (ev.all_day && endD > startD) {
      visibleMultiDay.push(ev);
    } else {
      const dDate = new Date(startD + 'T12:00:00');
      if (dDate.getFullYear() === year && dDate.getMonth() === month) {
        if (!singleDayByDate.has(startD)) singleDayByDate.set(startD, []);
        singleDayByDate.get(startD)!.push(ev);
      }
    }
  }
  for (const arr of singleDayByDate.values()) arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  // Group cells into week rows for spanning bar rendering
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  type MultiDayBar = {
    event: CalendarEvent;
    startCol: number;
    span: number;
    lane: number;
    isActualStart: boolean;
    isActualEnd: boolean;
  };

  function getBarsForWeek(week: (number | null)[]): MultiDayBar[] {
    const weekDates = week.map(d => (d !== null ? cellDate(d) : null));
    const nonNull = weekDates.filter((d): d is string => d !== null);
    if (nonNull.length === 0) return [];
    const weekStart = nonNull[0];
    const weekEnd = nonNull[nonNull.length - 1];

    type Raw = Omit<MultiDayBar, 'lane'>;
    const raw: Raw[] = [];

    for (const ev of visibleMultiDay) {
      const evStart = localISO(new Date(ev.starts_at));
      const evEnd = localISO(new Date(ev.ends_at!));
      if (evEnd < weekStart || evStart > weekEnd) continue;

      let startCol = 0;
      for (let c = 0; c < 7; c++) {
        if (weekDates[c] !== null && weekDates[c]! >= evStart) { startCol = c; break; }
      }
      let endCol = 6;
      for (let c = 6; c >= 0; c--) {
        if (weekDates[c] !== null && weekDates[c]! <= evEnd) { endCol = c; break; }
      }

      raw.push({
        event: ev,
        startCol,
        span: endCol - startCol + 1,
        isActualStart: evStart >= weekStart,
        isActualEnd: evEnd <= weekEnd,
      });
    }

    // Longer spans first so they claim lower lanes
    raw.sort((a, b) => b.span - a.span || a.startCol - b.startCol);

    const laneEnds: number[] = [];
    return raw.map(bar => {
      let lane = laneEnds.findIndex(end => end < bar.startCol);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = bar.startCol + bar.span - 1;
      return { ...bar, lane };
    });
  }

  // Group LCP org-cal events by day
  const lcpEventsByDay = new Map<string, LcpEvent[]>();
  for (const ev of lcpOrgEvents) {
    const d = localISO(new Date(ev.starts_at));
    const dDate = new Date(d + 'T12:00:00');
    if (dDate.getFullYear() === year && dDate.getMonth() === month) {
      if (!lcpEventsByDay.has(d)) lcpEventsByDay.set(d, []);
      lcpEventsByDay.get(d)!.push(ev);
    }
  }

  // Group deadlines by day
  const deadlinesByDay = new Map<string, DeadlineTask[]>();
  if (showDeadlines) {
    for (const t of deadlineTasks) {
      if (!t.due_date) continue;
      const d = t.due_date.slice(0, 10);
      if (!deadlinesByDay.has(d)) deadlinesByDay.set(d, []);
      deadlinesByDay.get(d)!.push(t);
    }
  }

  // Depts that are active but don't yet have a calendar built (show placeholder banner)
  const DEPTS_WITH_CALENDARS: Department[] = ['lcp'];
  const activeDeptLabels = myDepts
    .filter(d => showMyDepts && !disabledDepts.has(d) && !DEPTS_WITH_CALENDARS.includes(d))
    .map(d => DEPARTMENTS.find(x => x.value === d)?.label ?? d);

  function cellDate(d: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function openAdd(dStr: string) { setAddDate(dStr); setAddOpen(true); }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sparrow-rule px-6 py-3">
        <div className="flex flex-col gap-2">

          {/* Row 1: layer chips + month nav */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1.5">
              <button onClick={toggleAllStaff} className={showAllStaff ? CHIP_ON : CHIP_OFF}>
                All Staff
              </button>
              <button onClick={toggleMyDepts} className={showMyDepts ? CHIP_ON : CHIP_OFF}>
                My Depts
              </button>
              <button onClick={togglePersonal} className={showPersonal ? CHIP_ON : CHIP_OFF}>
                Personal
              </button>
              <button onClick={toggleDeadlines} className={showDeadlines ? CHIP_ON : CHIP_OFF}>
                Deadlines
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={prevMonth}
                className="grid h-7 w-7 place-items-center rounded-md text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
                aria-label="Previous month"
              >←</button>
              <span className="min-w-[11rem] text-center text-sm font-semibold text-sparrow-ink">
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
          </div>

          {/* Row 2: dept sub-chips — only shown when My Depts is on */}
          {showMyDepts && myDepts.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-sparrow-gray">My depts:</span>
              {myDepts.map(dept => (
                <button
                  key={dept}
                  onClick={() => toggleDept(dept)}
                  className={disabledDepts.has(dept) ? SUB_OFF : SUB_ON}
                >
                  {DEPARTMENTS.find(d => d.value === dept)?.label ?? dept}
                </button>
              ))}
            </div>
          )}

        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-sparrow-rule text-sm font-semibold text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
            aria-label="Calendar help"
            title="How the calendar works"
          >
            ?
          </button>
          <button onClick={() => openAdd(todayStr)} className="btn-primary text-sm">
            + Add event
          </button>
        </div>
      </div>
      <TabHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Calendar"
        intro="A month-view calendar with three independent filter layers. Toggle each one to control what you see."
        sections={CALENDAR_HELP_SECTIONS}
      />

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="p-8 text-sm text-sparrow-gray">Loading…</p>
        ) : (
          <>
            <div className="border-l border-t border-sparrow-rule">
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7">
                {DOW.map(d => (
                  <div key={d} className="border-b border-r border-sparrow-rule bg-sparrow-mist px-2 py-1.5 text-center text-xs font-semibold text-sparrow-gray">
                    {d}
                  </div>
                ))}
              </div>

              {/* Week rows */}
              {weeks.map((week, wi) => {
                const bars = getBarsForWeek(week);
                const numLanes = bars.length > 0 ? Math.max(...bars.map(b => b.lane)) + 1 : 0;

                // For each column, which bars cover it (sorted by lane)
                const barsByCol: MultiDayBar[][] = week.map(() => []);
                for (const bar of bars) {
                  for (let c = bar.startCol; c < bar.startCol + bar.span; c++) {
                    barsByCol[c].push(bar);
                  }
                }
                for (const arr of barsByCol) arr.sort((a, b) => a.lane - b.lane);

                return (
                  <div key={wi} className="grid grid-cols-7">
                    {week.map((d, col) => {
                      if (d === null) {
                        return <div key={`pad-${wi}-${col}`} className="min-h-[6rem] border-b border-r border-sparrow-rule bg-sparrow-mist/30" />;
                      }
                      const dStr = cellDate(d);
                      const dayEvents    = singleDayByDate.get(dStr) ?? [];
                      const dayLcpEvents = lcpEventsByDay.get(dStr) ?? [];
                      const dayDeadlines = deadlinesByDay.get(dStr) ?? [];
                      const isToday = dStr === todayStr;
                      const isPast = dStr < todayStr;
                      const shown = dayEvents.slice(0, 3);
                      const overflow = dayEvents.length - shown.length;
                      const colBars = barsByCol[col];

                      return (
                        <div key={dStr} className={`group min-h-[6rem] border-b border-r border-sparrow-rule p-1 ${isPast ? 'bg-sparrow-mist/30' : ''}`}>
                          {/* Day number */}
                          <div className="flex items-center justify-between">
                            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${isToday ? 'bg-sparrow-green text-white' : isPast ? 'text-sparrow-gray' : 'text-sparrow-ink'}`}>
                              {d}
                            </span>
                            <button
                              onClick={() => openAdd(dStr)}
                              className="hidden rounded px-1 text-sm leading-none text-sparrow-gray hover:text-sparrow-green group-hover:block"
                              aria-label={`Add event on ${dStr}`}
                            >+</button>
                          </div>

                          {/* Multi-day bar segments — below day number, one slot per lane.
                              Container uses -mx-1 to extend to the cell's border inner edges.
                              Buttons use display:block (auto-width) so they fill the container
                              minus any per-button margin. This gives a near-seamless band
                              across covered days with only the 1px cell border as a divider. */}
                          {numLanes > 0 && (
                            <div className="-mx-1 mt-1 space-y-0.5">
                              {Array.from({ length: numLanes }, (_, lane) => {
                                const bar = colBars.find(b => b.lane === lane);
                                if (!bar) return <div key={lane} className="h-5" />;
                                const isFirstCell = col === bar.startCol;
                                const isLastCell  = col === bar.startCol + bar.span - 1;
                                const roundL = bar.isActualStart && isFirstCell;
                                const roundR = bar.isActualEnd   && isLastCell;
                                // mx-1 adds back the inset for rounded ends; rounded-none prevents
                                // Tailwind's default border-radius on the non-rounded side.
                                const shapeClass = roundL && roundR
                                  ? 'mx-1 rounded'
                                  : roundL
                                  ? 'ml-1 rounded-l rounded-r-none'
                                  : roundR
                                  ? 'mr-1 rounded-r rounded-l-none'
                                  : 'rounded-none';
                                return (
                                  <button
                                    key={bar.event.id}
                                    onClick={() => setDetailEvent(bar.event)}
                                    className={`block h-5 truncate px-1.5 text-left text-[10px] font-medium leading-5 transition hover:opacity-80 ${shapeClass} ${bar.event.is_personal ? 'bg-slate-400 text-white' : KIND_PILL[bar.event.kind]}`}
                                    onMouseEnter={(e) => setCalTooltip({ title: bar.event.title, sub: bar.event.is_personal ? 'Personal' : KIND_LABEL[bar.event.kind], x: e.clientX, y: e.clientY })}
                                    onMouseLeave={() => setCalTooltip(null)}
                                  >
                                    {isFirstCell ? bar.event.title : ''}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Single-day events */}
                          <div className={`mt-1 space-y-0.5 ${isPast ? 'opacity-60' : ''}`}>
                            {shown.map(ev => (
                              <button
                                key={ev.id}
                                onClick={() => setDetailEvent(ev)}
                                className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition hover:opacity-75 ${ev.is_personal ? 'bg-slate-100 text-slate-600' : KIND_PILL[ev.kind]}`}
                                onMouseEnter={(e) => setCalTooltip({ title: ev.title, sub: ev.is_personal ? 'Personal' : KIND_LABEL[ev.kind], time: ev.all_day ? undefined : shortTime(ev.starts_at), location: ev.location ?? undefined, x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setCalTooltip(null)}
                              >
                                {ev.is_personal ? '· ' : ''}{ev.all_day ? '' : `${shortTime(ev.starts_at)} · `}{ev.title}
                              </button>
                            ))}
                            {overflow > 0 && <p className="pl-1 text-[10px] text-sparrow-gray">+{overflow} more</p>}
                          </div>

                          {/* LCP dept events (show_on_org_calendar = true) */}
                          {dayLcpEvents.map(ev => (
                            <div
                              key={ev.id}
                              className="mt-0.5 w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight bg-emerald-100 text-emerald-800"
                              onMouseEnter={(e) => setCalTooltip({ title: ev.title, sub: `LCP · ${EVENT_LABEL[ev.kind]}`, x: e.clientX, y: e.clientY })}
                              onMouseLeave={() => setCalTooltip(null)}
                            >
                              LCP · {ev.title}
                            </div>
                          ))}

                          {/* Deadline task pills */}
                          {dayDeadlines.length > 0 && (
                            <div className="mt-0.5 space-y-0.5">
                              {dayDeadlines.slice(0, 3).map(task => (
                                <div
                                  key={task.id}
                                  className={`w-full truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${DEADLINE_PILL[task.priority]}`}
                                  onMouseEnter={(e) => setCalTooltip({ title: task.title, sub: task.priority.toUpperCase(), x: e.clientX, y: e.clientY })}
                                  onMouseLeave={() => setCalTooltip(null)}
                                >
                                  {task.title}
                                </div>
                              ))}
                              {dayDeadlines.length > 3 && (
                                <p className="pl-1 text-[10px] text-sparrow-gray">+{dayDeadlines.length - 3} more</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Dept calendar placeholder — shown for each active dept chip */}
            {activeDeptLabels.length > 0 && (
              <div className="m-4 rounded-lg border border-sparrow-rule bg-sparrow-mist px-4 py-2.5 text-sm text-sparrow-gray">
                {activeDeptLabels.join(', ')} calendar events will appear here as each dept room's calendar is set up.
                {/* TODO: fetch dept calendar events per active dept once each dept room calendar is built */}
              </div>
            )}
          </>
        )}
      </div>

      <AddOrgEventPanel
        open={addOpen}
        defaultDate={addDate}
        currentUserId={profile?.id ?? ''}
        userDepts={myDepts}
        initialDept={(() => {
          if (!showMyDepts || showAllStaff) return null;
          const active = myDepts.filter(d => !disabledDepts.has(d));
          return active[0] ?? null;
        })()}
        initialPersonal={showPersonal && !showAllStaff}
        onClose={() => setAddOpen(false)}
        onCreated={() => { setAddOpen(false); void load(); }}
      />
      <OrgEventDetailPanel
        event={detailEvent}
        currentUserId={profile?.id ?? ''}
        isAdmin={profile?.role === 'admin'}
        onClose={() => setDetailEvent(null)}
        onDeleted={() => { setDetailEvent(null); void load(); }}
        onUpdated={() => { setDetailEvent(null); void load(); }}
        onOpenNotes={(ev) => { setDetailEvent(null); setNotesEvent(ev); }}
      />
      {calTooltip && <CalTooltip s={calTooltip} />}
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
