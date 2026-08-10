import { useState } from 'react';
import { EVENT_LABEL, SESSION_LOG_LABEL, type LcpEvent, type SessionLog } from '@/lib/lcp-types';
import { timeLabel } from '@/lib/lcp-format';

interface TooltipState { title: string; sub?: string; x: number; y: number; }

function EventTooltip({ s }: { s: TooltipState }) {
  const left = s.x > window.innerWidth - 290 ? s.x - 274 : s.x + 14;
  const top = s.y + 16;
  return (
    <div
      className="pointer-events-none fixed z-50 w-56 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3 shadow-lg"
      style={{ left, top }}
    >
      <p className="text-sm font-medium leading-snug text-sparrow-ink dark:text-sparrow-dark-ink">{s.title}</p>
      {s.sub && <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{s.sub}</p>}
    </div>
  );
}

// Same muted bg-{color}-100 / text-{color}-700 pairing the Team Cal's label
// system uses (see LABEL_COLORS in LabelPill.tsx) — kept consistent across
// both calendars rather than the bolder -500 shades this used to have.
const KIND_COLOR: Record<string, string> = {
  curriculum: 'bg-sparrow-sage text-sparrow-green dark:text-sparrow-dark-green',
  one_on_one:  'bg-amber-100 text-amber-700',
  dinner:      'bg-violet-100 text-violet-700',
  volunteer:   'bg-sky-100 text-sky-700',
  other:       'bg-slate-100 text-slate-700',
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildGrid(year: number, month: number): Date[] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];

  for (let i = firstDow - 1; i >= 0; i--) days.push(new Date(year, month, -i));
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, days.length - daysInMonth - firstDow + 1));
  }
  return days;
}

interface Props {
  events: LcpEvent[];
  logs: SessionLog[];
  onEventClick: (event: LcpEvent) => void;
  onLogClick: (log: SessionLog) => void;
  onAdd: () => void;
}

export function LcpCalendar({ events, logs, onEventClick, onLogClick, onAdd }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const todayISO = localISO(today);

  const eventsByDate = new Map<string, LcpEvent[]>();
  for (const ev of events) {
    const d = ev.starts_at.slice(0, 10);
    const list = eventsByDate.get(d) ?? [];
    list.push(ev);
    eventsByDate.set(d, list);
  }

  // First log per date (logs arrive sorted newest-first)
  const logsByDate = new Map<string, SessionLog>();
  for (const log of logs) {
    if (!logsByDate.has(log.session_date)) logsByDate.set(log.session_date, log);
  }

  const days = buildGrid(year, month);

  function prev() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function next() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  const upcoming = events
    .filter((e) => new Date(e.starts_at).getTime() >= Date.now())
    .slice(0, 5);

  return (
    <div className="space-y-6">

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={prev}
            className="rounded-lg px-2 py-1.5 text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
          >
            ←
          </button>
          <span className="min-w-[160px] text-center text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">
            {MONTHS[month]} {year}
          </span>
          <button
            onClick={next}
            className="rounded-lg px-2 py-1.5 text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
          >
            →
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
          >
            Today
          </button>
          <button onClick={onAdd} className="btn-primary text-xs">
            + Add event
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
        <div className="grid grid-cols-7 border-b border-sparrow-rule dark:border-sparrow-dark-border">
          {DOW.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 divide-x divide-y divide-sparrow-rule/50">
          {days.map((day, i) => {
            const iso = localISO(day);
            const inMonth = day.getMonth() === month;
            const isToday = iso === todayISO;
            const isPast = iso < todayISO;
            const dayEvents = eventsByDate.get(iso) ?? [];
            const dayLog = logsByDate.get(iso);
            const shown = dayEvents.slice(0, 2);
            const overflow = dayEvents.length - 2;

            return (
              <div key={i} className={`min-h-[84px] p-1.5 ${!inMonth ? 'bg-sparrow-mist/30' : ''}`}>
                <div
                  className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? 'bg-sparrow-green text-white'
                      : !inMonth
                        ? 'text-sparrow-rule dark:text-sparrow-dark-border'
                        : isPast
                          ? 'text-sparrow-gray dark:text-sparrow-dark-gray'
                          : 'text-sparrow-ink dark:text-sparrow-dark-ink'
                  }`}
                >
                  {day.getDate()}
                </div>
                <div className="space-y-0.5">
                  {shown.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => isPast && dayLog ? onLogClick(dayLog) : onEventClick(ev)}
                      onMouseEnter={(e) => setTooltip({ title: ev.title, sub: `${timeLabel(ev.starts_at)} · ${EVENT_LABEL[ev.kind]}`, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setTooltip(null)}
                      className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition hover:opacity-75 ${
                        isPast ? 'bg-sparrow-rule dark:bg-sparrow-dark-border text-sparrow-gray dark:text-sparrow-dark-gray' : (KIND_COLOR[ev.kind] ?? 'bg-slate-400 text-white')
                      }`}
                    >
                      {timeLabel(ev.starts_at)} {ev.title}
                    </button>
                  ))}
                  {/* Past day with a logged session but no scheduled event */}
                  {isPast && dayLog && dayEvents.length === 0 && (
                    <button
                      onClick={() => onLogClick(dayLog)}
                      onMouseEnter={(e) => setTooltip({ title: SESSION_LOG_LABEL[dayLog.session_type], x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setTooltip(null)}
                      className="w-full truncate rounded bg-sparrow-rule dark:bg-sparrow-dark-border px-1 py-0.5 text-left text-[10px] font-medium leading-tight text-sparrow-gray dark:text-sparrow-dark-gray transition hover:opacity-75"
                    >
                      {SESSION_LOG_LABEL[dayLog.session_type]}
                    </button>
                  )}
                  {overflow > 0 && (
                    <p className="pl-1 text-[10px] text-sparrow-gray dark:text-sparrow-dark-gray">+{overflow} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming list */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Upcoming</h2>
          <ul className="divide-y divide-sparrow-rule dark:divide-sparrow-dark-border overflow-hidden rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
            {upcoming.map((ev) => (
              <li key={ev.id}>
                <button
                  onClick={() => onEventClick(ev)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                >
                  <span className="w-28 shrink-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                    {ev.starts_at.slice(5, 10).replace('-', '/')} · {timeLabel(ev.starts_at)}
                  </span>
                  <span className="flex-1 text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{ev.title}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${KIND_COLOR[ev.kind] ?? 'bg-slate-400 text-white'}`}>
                    {EVENT_LABEL[ev.kind]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {events.length === 0 && (
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No sessions scheduled yet.</p>
      )}

      {tooltip && <EventTooltip s={tooltip} />}
    </div>
  );
}
