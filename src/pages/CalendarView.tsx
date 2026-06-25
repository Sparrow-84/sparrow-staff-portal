import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchCalendar, KIND_PILL, type CalendarEvent } from '@/lib/calendar';
import { AddOrgEventPanel } from '@/components/calendar/AddOrgEventPanel';
import { OrgEventDetailPanel } from '@/components/calendar/OrgEventDetailPanel';

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

export function CalendarView() {
  const { profile } = useAuth();
  const today = new Date();
  const todayStr = localISO(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState(todayStr);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const load = useCallback(async () => {
    try {
      setEvents(await fetchCalendar());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  // Build grid cells
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startPad = firstDay.getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Group events by day string
  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const d = localISO(new Date(ev.starts_at));
    const dDate = new Date(d + 'T12:00:00');
    if (dDate.getFullYear() === year && dDate.getMonth() === month) {
      if (!eventsByDay.has(d)) eventsByDay.set(d, []);
      eventsByDay.get(d)!.push(ev);
    }
  }
  for (const arr of eventsByDay.values()) {
    arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  function cellDate(d: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function openAdd(dStr: string) {
    setAddDate(dStr);
    setAddOpen(true);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sparrow-rule px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Layer toggles */}
          <div className="flex gap-0.5 rounded-lg border border-sparrow-rule bg-sparrow-mist p-0.5">
            <button className="rounded-md bg-white px-3 py-1 text-xs font-medium text-sparrow-ink shadow-sm">
              All Staff
            </button>
            <button
              disabled
              title="My Depts layer — added as each dept room gets its calendar"
              className="cursor-not-allowed rounded-md px-3 py-1 text-xs font-medium text-sparrow-gray opacity-40"
            >
              My Depts
            </button>
            <button
              disabled
              title="Personal layer — coming with staff assignment feature"
              className="cursor-not-allowed rounded-md px-3 py-1 text-xs font-medium text-sparrow-gray opacity-40"
            >
              Personal
            </button>
          </div>

          {/* Month nav */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={prevMonth}
              className="grid h-7 w-7 place-items-center rounded-md text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
              aria-label="Previous month"
            >
              ←
            </button>
            <span className="min-w-[11rem] text-center text-sm font-semibold text-sparrow-ink">
              {MONTHS[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="grid h-7 w-7 place-items-center rounded-md text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
              aria-label="Next month"
            >
              →
            </button>
            <button
              onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
              className="rounded-md border border-sparrow-rule px-2 py-0.5 text-xs text-sparrow-gray hover:text-sparrow-ink"
            >
              Today
            </button>
          </div>
        </div>

        <button
          onClick={() => openAdd(todayStr)}
          className="btn-primary text-sm"
        >
          + Add event
        </button>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="p-8 text-sm text-sparrow-gray">Loading…</p>
        ) : (
          <div className="grid grid-cols-7 border-l border-t border-sparrow-rule">
            {/* Day-of-week headers */}
            {DOW.map((d) => (
              <div
                key={d}
                className="border-b border-r border-sparrow-rule bg-sparrow-mist px-2 py-1.5 text-center text-xs font-semibold text-sparrow-gray"
              >
                {d}
              </div>
            ))}

            {/* Day cells */}
            {cells.map((d, i) => {
              if (d === null) {
                return (
                  <div
                    key={`pad-${i}`}
                    className="min-h-[6rem] border-b border-r border-sparrow-rule bg-sparrow-mist/30"
                  />
                );
              }
              const dStr = cellDate(d);
              const dayEvents = eventsByDay.get(dStr) ?? [];
              const isToday = dStr === todayStr;
              const shown = dayEvents.slice(0, 3);
              const overflow = dayEvents.length - shown.length;

              return (
                <div key={dStr} className="group min-h-[6rem] border-b border-r border-sparrow-rule p-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
                        isToday ? 'bg-sparrow-green text-white' : 'text-sparrow-ink'
                      }`}
                    >
                      {d}
                    </span>
                    <button
                      onClick={() => openAdd(dStr)}
                      className="hidden rounded px-1 text-sm leading-none text-sparrow-gray hover:text-sparrow-green group-hover:block"
                      aria-label={`Add event on ${dStr}`}
                    >
                      +
                    </button>
                  </div>

                  <div className="mt-1 space-y-0.5">
                    {shown.map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => setDetailEvent(ev)}
                        className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition hover:opacity-75 ${KIND_PILL[ev.kind]}`}
                      >
                        {ev.all_day ? '' : `${shortTime(ev.starts_at)} · `}{ev.title}
                      </button>
                    ))}
                    {overflow > 0 && (
                      <p className="pl-1 text-[10px] text-sparrow-gray">+{overflow} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddOrgEventPanel
        open={addOpen}
        defaultDate={addDate}
        currentUserId={profile?.id ?? ''}
        onClose={() => setAddOpen(false)}
        onCreated={() => { setAddOpen(false); void load(); }}
      />
      <OrgEventDetailPanel
        event={detailEvent}
        currentUserId={profile?.id ?? ''}
        isAdmin={profile?.role === 'admin'}
        onClose={() => setDetailEvent(null)}
        onDeleted={() => { setDetailEvent(null); void load(); }}
      />
    </div>
  );
}
