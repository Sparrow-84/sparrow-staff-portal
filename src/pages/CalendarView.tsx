import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TabHelpModal } from '@/components/TabHelpModal';

const CALENDAR_HELP_SECTIONS = [
  {
    heading: 'Filter layers',
    items: [
      { label: 'All Staff', desc: 'Org-wide events added by admins — team meetings, site visits, program milestones. On by default.' },
      { label: 'My Depts', desc: 'Events from your department rooms. Enable sub-department chips to filter further. LCP sessions appear here when toggled on.' },
      { label: 'Personal', desc: 'Your agenda: personal reminders and appointments you add (only you ever see those, including admins), plus any All Staff or dept event you\'re attending or created — even from a department that isn\'t your own.' },
      { label: 'Deadlines', desc: 'Your task due dates shown as labeled pills — red for P1, gold for P2, gray for P3/P4.' },
      { label: 'Office Rooms', desc: 'Shows all events that have an office room booked. Hover any event to see which room. Use this to check availability before scheduling a meeting in the office.' },
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
import { fetchCalendar, fetchEventIdsWithSharedNotes, fetchMyAttendance, KIND_LABEL, KIND_PILL, LAYER_PILL, getLayerPill, type CalendarEvent, type EventAttendee } from '@/lib/calendar';
import { LABEL_COLORS } from '@/components/LabelPill';
import { AddOrgEventPanel } from '@/components/calendar/AddOrgEventPanel';
import { OrgEventDetailPanel } from '@/components/calendar/OrgEventDetailPanel';
import { MeetingNotesView } from '@/components/calendar/MeetingNotesView';
import { fetchOrgCalLcpEvents } from '@/lib/lcp';
import type { LcpEvent } from '@/lib/lcp-types';
import { EVENT_LABEL } from '@/lib/lcp-types';
import { supabase } from '@/lib/supabase';
import { fetchProfiles } from '@/lib/data';
import type { Department, Priority, Profile, Task } from '@/lib/types';
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
  p1: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300',
  p2: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  p3: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300',
  p4: 'bg-slate-100 dark:bg-slate-500/15 text-slate-400 dark:text-slate-500',
};

// Filter chip styles — each chip is independent, not a radio group
const CHIP_ON  = 'rounded-md border border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green px-3 py-1 text-xs font-medium text-white transition';
const CHIP_OFF = 'rounded-md border border-sparrow-rule dark:border-sparrow-dark-border px-3 py-1 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray transition hover:border-sparrow-gray dark:hover:border-sparrow-dark-border hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink';

// Dept sub-chip styles (slightly smaller)
const SUB_ON  = 'rounded border border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green px-2.5 py-0.5 text-[11px] font-medium text-white transition';
const SUB_OFF = 'rounded border border-sparrow-rule dark:border-sparrow-dark-border px-2.5 py-0.5 text-[11px] font-medium text-sparrow-gray dark:text-sparrow-dark-gray transition hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink';

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
      className="pointer-events-none fixed z-50 w-56 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3 shadow-lg"
      style={{ left, top }}
    >
      <p className="text-sm font-medium leading-snug text-sparrow-ink dark:text-sparrow-dark-ink">{s.title}</p>
      {s.sub && <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{s.sub}</p>}
      {s.time && <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{s.time}</p>}
      {s.location && <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{s.location}</p>}
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
  const [notedEventIds, setNotedEventIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState(todayStr);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [notesEvent, setNotesEvent] = useState<CalendarEvent | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
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
    () => localStorage.getItem('calendar_show_personal') !== 'false', // default on
  );
  const [showRooms, setShowRooms] = useState(
    () => localStorage.getItem('calendar_show_rooms') === 'true',
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
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [myAttendance, setMyAttendance] = useState<EventAttendee[]>([]);

  const load = useCallback(async () => {
    try {
      const [evs, profs, noted, attendance] = await Promise.all([
        fetchCalendar(),
        fetchProfiles(),
        fetchEventIdsWithSharedNotes(),
        profile ? fetchMyAttendance(profile.id) : Promise.resolve([]),
      ]);
      setEvents(evs);
      setProfiles(profs);
      setNotedEventIds(noted);
      setMyAttendance(attendance);
    }
    finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { void load(); }, [load]);

  // When arriving here from an event notification (invited/removed/created), open that
  // event's detail panel directly — mirrors TaskWorkspace's pendingTaskOpen handoff.
  const pendingOpenId = useRef<string | null>(
    typeof window !== 'undefined' ? sessionStorage.getItem('sparrow.pendingEventOpen') : null,
  );
  useEffect(() => {
    if (!pendingOpenId.current || events.length === 0) return;
    const id = pendingOpenId.current;
    pendingOpenId.current = null;
    sessionStorage.removeItem('sparrow.pendingEventOpen');
    const ev = events.find((x) => x.id === id);
    if (ev) setDetailEvent(ev);
  }, [events]);

  // Same-view case: clicking an event notification while already on Calendar doesn't
  // remount this component, so the sessionStorage handoff above never fires.
  useEffect(() => {
    function onOpenEvent(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      const ev = events.find((x) => x.id === id);
      if (ev) {
        setDetailEvent(ev);
        sessionStorage.removeItem('sparrow.pendingEventOpen');
      }
    }
    window.addEventListener('sparrow:openEvent', onOpenEvent);
    return () => window.removeEventListener('sparrow:openEvent', onOpenEvent);
  }, [events]);

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
  function toggleRooms() {
    setShowRooms(v => { const n = !v; localStorage.setItem('calendar_show_rooms', String(n)); return n; });
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

  // Personal tab = my agenda: personal events I made, plus anything elsewhere (All Staff
  // or any dept, including ones outside my own) that I'm attending or created — mirrors
  // WidgetHome's My Week filter (see visibleEvents there), just not capped to this week.
  // This is the correct home for e.g. a cross-dept event invite: it doesn't belong under
  // My Depts (it's not my department's event), it belongs here.
  const attendanceMap = new Map(myAttendance.map((a) => [a.event_id, a.status]));
  function isAttendingOrMine(ev: CalendarEvent): boolean {
    return ev.department === null
      ? attendanceMap.get(ev.id) !== 'opted_out'
      : attendanceMap.get(ev.id) === 'attending' || ev.created_by === profile?.id;
  }

  // Active dept sub-chips (only meaningful while My Depts is on)
  const activeDeptChips = showMyDepts ? myDepts.filter(d => !disabledDepts.has(d)) : [];

  // Agenda mode: 2+ distinct browse sources on at once (All Staff plus each active dept
  // chip — Personal doesn't count, it's already agenda-only) switches every browse layer
  // down to "only what I'm attending or created." Mixing whole departments together
  // otherwise reads as a wall of other people's events with no way to tell which are
  // actually yours. A single source still shows everything, for dept oversight.
  const activeSourceLayers = (showAllStaff ? 1 : 0) + activeDeptChips.length;
  const isMultiLayer = activeSourceLayers > 1;

  // Partition events: single-day go into a map keyed by date; multi-day all-day events
  // go into a separate array for spanning-bar rendering across the week grid.
  const singleDayByDate = new Map<string, CalendarEvent[]>();
  const visibleMultiDay: CalendarEvent[] = [];
  for (const ev of events) {
    const isPersonal = ev.is_personal;
    const isAllStaff = !isPersonal && ev.department === null;
    const isDept = !isPersonal && ev.department !== null && myDepts.includes(ev.department) && !disabledDepts.has(ev.department);
    const isRoomBooked = showRooms && !!ev.room_id;
    const isMyAgenda = isPersonal || isAttendingOrMine(ev);
    const passesAgendaSqueeze = !isMultiLayer || isPersonal || isAttendingOrMine(ev);
    if (
      !(isAllStaff && showAllStaff && passesAgendaSqueeze) &&
      !(isDept && showMyDepts && passesAgendaSqueeze) &&
      !(isMyAgenda && showPersonal) &&
      !isRoomBooked
    ) continue;

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

  // Group days into week rows for spanning bar rendering
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  type MultiDayBar = {
    event: CalendarEvent;
    startCol: number;
    span: number;
    lane: number;
    isActualStart: boolean;
    isActualEnd: boolean;
  };

  function getBarsForWeek(week: Date[]): MultiDayBar[] {
    const weekDates = week.map(localISO);
    const weekStart = weekDates[0];
    const weekEnd = weekDates[weekDates.length - 1];

    type Raw = Omit<MultiDayBar, 'lane'>;
    const raw: Raw[] = [];

    for (const ev of visibleMultiDay) {
      const evStart = ev.starts_at.slice(0, 10); // all multi-day events are all_day; use UTC date directly
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
    if (!lcpEventsByDay.has(d)) lcpEventsByDay.set(d, []);
    lcpEventsByDay.get(d)!.push(ev);
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
  const DEPTS_WITH_CALENDARS: Department[] = ['lcp', 'toc', 'partnerships', 'ops'];
  const activeDeptLabels = activeDeptChips
    .filter(d => !DEPTS_WITH_CALENDARS.includes(d))
    .map(d => DEPARTMENTS.find(x => x.value === d)?.label ?? d);

  function openAdd(dStr: string) { setAddDate(dStr); setAddOpen(true); }

  function eventPillClass(ev: CalendarEvent): string {
    if (isMultiLayer) return getLayerPill(ev);
    if (ev.label?.color) {
      const meta = LABEL_COLORS.find((c) => c.id === ev.label!.color);
      if (meta) return meta.pill;
    }
    // Fallback for events without labels (pre-migration or unlabeled)
    return ev.is_personal ? 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300' : KIND_PILL[ev.kind];
  }

  // Suppress unused import warning — LAYER_PILL referenced via getLayerPill
  void LAYER_PILL;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sparrow-rule dark:border-sparrow-dark-border px-6 py-3">
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
              <button onClick={toggleRooms} className={showRooms ? CHIP_ON : CHIP_OFF}>
                Office Rooms
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={prevMonth}
                className="grid h-7 w-7 place-items-center rounded-md text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                aria-label="Previous month"
              >←</button>
              <span className="min-w-[11rem] text-center text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">
                {MONTHS[month]} {year}
              </span>
              <button
                onClick={nextMonth}
                className="grid h-7 w-7 place-items-center rounded-md text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                aria-label="Next month"
              >→</button>
              <button
                onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
                className="rounded-md border border-sparrow-rule dark:border-sparrow-dark-border px-2 py-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
              >
                Today
              </button>
            </div>
          </div>

          {/* Row 2: dept sub-chips — only shown when My Depts is on */}
          {showMyDepts && myDepts.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">My depts:</span>
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

          {/* Agenda-mode note — only appears once 2+ browse sources are on at once */}
          {isMultiLayer && (
            <p className="text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
              Showing only events you're attending or created — turn off a layer or dept chip to browse everyone's events again.
            </p>
          )}

        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-sparrow-rule dark:border-sparrow-dark-border text-sm font-semibold text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
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
          <p className="p-8 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
        ) : (
          <>
            <div className="border-l border-t border-sparrow-rule dark:border-sparrow-dark-border">
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7">
                {DOW.map(d => (
                  <div key={d} className="border-b border-r border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-2 py-1.5 text-center text-xs font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">
                    {d}
                  </div>
                ))}
              </div>

              {/* Week rows */}
              {weeks.map((week, wi) => {
                const bars = getBarsForWeek(week);
                const numLanes = bars.length > 0 ? Math.max(...bars.map(b => b.lane)) + 1 : 0;
                // Each lane is 20px bar + 2px gap; 4px top margin before first lane
                const barAreaPx = numLanes > 0 ? 4 + numLanes * 22 : 0;

                return (
                  // position:relative so absolutely-positioned bars anchor to this row
                  <div key={wi} className="relative">
                    <div className="grid grid-cols-7">
                      {week.map((day, col) => {
                        const dStr = localISO(day);
                        const inMonth = day.getMonth() === month;
                        const dayEvents    = singleDayByDate.get(dStr) ?? [];
                        const dayLcpEvents = lcpEventsByDay.get(dStr) ?? [];
                        const dayDeadlines = deadlinesByDay.get(dStr) ?? [];
                        const isToday = dStr === todayStr;
                        const isPast = dStr < todayStr;
                        const isExpanded = expandedDays.has(dStr);
                        const shown = isExpanded ? dayEvents : dayEvents.slice(0, 3);
                        const overflow = dayEvents.length - shown.length;

                        return (
                          <div
                            key={`${dStr}-${col}`}
                            className={`group min-h-[6rem] border-b border-r border-sparrow-rule dark:border-sparrow-dark-border p-1 ${!inMonth || isPast ? 'bg-sparrow-mist/30 dark:bg-black/20' : ''}`}
                            style={barAreaPx > 0 ? { paddingTop: barAreaPx + 4 } : undefined}
                          >
                            {/* Day number */}
                            <div className="flex items-center justify-between">
                              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${isToday ? 'bg-sparrow-green text-white' : !inMonth ? 'text-sparrow-rule dark:text-sparrow-dark-border' : isPast ? 'text-sparrow-gray dark:text-sparrow-dark-gray' : 'text-sparrow-ink dark:text-sparrow-dark-ink'}`}>
                                {day.getDate()}
                              </span>
                              <button
                                onClick={() => openAdd(dStr)}
                                className="hidden rounded px-1 text-sm leading-none text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green dark:hover:text-sparrow-dark-green group-hover:block"
                                aria-label={`Add event on ${dStr}`}
                              >+</button>
                            </div>

                            {/* Single-day events */}
                            <div className={`mt-1 space-y-0.5 ${isPast ? 'opacity-60' : ''}`}>
                              {shown.map(ev => {
                                const roomName = ev.office_room?.name ?? null;
                                const labelName = ev.label?.name ?? (ev.is_personal ? 'Personal' : KIND_LABEL[ev.kind]);
                                return (
                                  <button
                                    key={ev.id}
                                    onClick={() => setDetailEvent(ev)}
                                    className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition hover:opacity-75 ${eventPillClass(ev)}`}
                                    onMouseEnter={(e) => setCalTooltip({ title: ev.title, sub: roomName ? `${labelName} · ${roomName}` : labelName, time: ev.all_day ? undefined : shortTime(ev.starts_at), location: ev.location ?? undefined, x: e.clientX, y: e.clientY })}
                                    onMouseLeave={() => setCalTooltip(null)}
                                  >
                                    <span className="min-w-0 truncate">
                                      {ev.is_personal ? '· ' : ''}{ev.all_day ? '' : `${shortTime(ev.starts_at)} · `}{ev.title}
                                    </span>
                                    {notedEventIds.has(ev.id) && (
                                      <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-black/40 bg-white dark:bg-sparrow-dark-surface" aria-hidden />
                                    )}
                                  </button>
                                );
                              })}
                              {overflow > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedDays((prev) => new Set(prev).add(dStr))}
                                  className="w-full pl-1 text-left text-[10px] font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                                >
                                  +{overflow} more
                                </button>
                              )}
                            </div>

                            {/* LCP dept events (show_on_org_calendar = true) */}
                            {dayLcpEvents.map(ev => (
                              <div
                                key={ev.id}
                                className="mt-0.5 w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
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
                                  <p className="pl-1 text-[10px] text-sparrow-gray dark:text-sparrow-dark-gray">+{dayDeadlines.length - 3} more</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Multi-day event bars — one element per event per week, absolutely
                        positioned so they span continuously across all covered columns.
                        Cell content is pushed down via paddingTop to clear the bar area. */}
                    {bars.map(bar => {
                      const leftPct = (bar.startCol / 7) * 100;
                      const widthPct = (bar.span / 7) * 100;
                      const topPx = 4 + bar.lane * 22;
                      // Inset 4px on rounded ends so the bar sits inside the cell padding;
                      // otherwise extend edge-to-edge for a seamless spanning appearance.
                      const leftAdj = bar.isActualStart ? 4 : 0;
                      const rightAdj = bar.isActualEnd ? 4 : 0;
                      const roundedClass = [
                        bar.isActualStart ? 'rounded-l' : '',
                        bar.isActualEnd ? 'rounded-r' : '',
                      ].filter(Boolean).join(' ') || 'rounded-none';
                      return (
                        <button
                          key={`bar-${bar.event.id}-${wi}`}
                          onClick={() => setDetailEvent(bar.event)}
                          className={`absolute flex h-5 items-center gap-1 px-1.5 text-left text-[10px] font-medium leading-5 transition hover:opacity-80 ${roundedClass} ${eventPillClass(bar.event)}`}
                          style={{
                            left: `calc(${leftPct}% + ${leftAdj}px)`,
                            width: `calc(${widthPct}% - ${leftAdj}px - ${rightAdj}px)`,
                            top: topPx,
                          }}
                          onMouseEnter={(e) => setCalTooltip({ title: bar.event.title, sub: bar.event.label?.name ?? (bar.event.is_personal ? 'Personal' : KIND_LABEL[bar.event.kind]), x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setCalTooltip(null)}
                        >
                          <span className="min-w-0 truncate">{bar.event.title}</span>
                          {notedEventIds.has(bar.event.id) && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-black/40 bg-white dark:bg-sparrow-dark-surface" aria-hidden />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Dept calendar placeholder — shown for each active dept chip */}
            {activeDeptLabels.length > 0 && (
              <div className="m-4 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-4 py-2.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
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
        isAdmin={profile?.role === 'admin'}
        userDepts={myDepts}
        profiles={profiles}
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
        profiles={profiles}
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
