import { useState, type ReactNode } from 'react';
import type { Profile, TaskComment, TaskWithPeople } from '@/lib/types';
import type { AppNotification } from '@/lib/social';
import type { QuickWin } from '@/lib/quickwins';
import type { CalendarEvent } from '@/lib/calendar';
import type { View } from '../Sidebar';
import { acceptTask, deferTask, pushBackTask, setTaskStatus } from '@/lib/data';
import { markAllRead, markRead } from '@/lib/social';
import { addQuickWinNote, QUICK_WIN_EMOJI } from '@/lib/quickwins';
import { expandEvents, KIND_PILL } from '@/lib/calendar';
import { bucketFor, dueLabel, isoDate, TIER_META, tierForPriority } from '@/lib/tasks';

/** Everything a widget might need — passed whole so each widget reads what it uses. */
export interface WidgetContext {
  me: Profile;
  tasks: TaskWithPeople[];
  comments: TaskComment[];
  notifications: AppNotification[];
  wins: QuickWin[];
  events: CalendarEvent[];
  reports: Profile[];
  today: string;
  onChanged: () => void;
  onOpenTask: (t: TaskWithPeople) => void;
  onNavigate: (v: View) => void;
}

export type WidgetKey =
  | 'today_tasks'
  | 'triage'
  | 'team_pulse'
  | 'upcoming_meetings'
  | 'notifications'
  | 'quick_wins'
  | 'mini_calendar'
  | 'my_week';

interface WidgetDef {
  key: WidgetKey;
  label: string;
  Comp: (props: { ctx: WidgetContext }) => ReactNode;
  managerOnly?: boolean;
  wide?: boolean; // spans both columns on large screens
}

// ── Shared card chrome ────────────────────────────────────────────────
export function WidgetCard({
  title,
  headerRight,
  children,
}: {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-sparrow-rule bg-white shadow-card">
      <header className="flex items-center justify-between gap-2 border-b border-sparrow-rule px-4 py-2.5">
        <h2 className="font-serif text-base font-semibold text-sparrow-green">{title}</h2>
        {headerRight}
      </header>
      <div className="flex-1 px-4 py-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-sparrow-gray">{children}</p>;
}

function addDays(today: string, n: number): string {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

// ── My tasks — today ──────────────────────────────────────────────────
function TodayTasksWidget({ ctx }: { ctx: WidgetContext }) {
  const [fading, setFading] = useState<Set<string>>(new Set());

  const mine = ctx.tasks.filter(
    (t) => t.assignee_id === ctx.me.id && t.triage_status === 'accepted' && t.status !== 'done',
  );
  const due = mine
    .filter((t) => {
      const b = bucketFor(t.due_date, false, ctx.today);
      return b === 'overdue' || b === 'today';
    })
    .sort((a, b) => a.priority.localeCompare(b.priority));

  function complete(t: TaskWithPeople) {
    setFading((s) => new Set(s).add(t.id));
    window.setTimeout(async () => {
      await setTaskStatus(t.id, 'done');
      ctx.onChanged();
    }, 450);
  }

  if (due.length === 0) {
    return (
      <div className="py-3 text-center">
        <p className="text-sm font-medium text-sparrow-ink">You've done all of today's tasks! 🎉</p>
        <button onClick={() => ctx.onNavigate('tasks')} className="btn-ghost mt-2 text-sparrow-green">
          Get ahead on next week →
        </button>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {due.map((t) => {
        const tier = TIER_META[tierForPriority(t.priority)];
        const isFading = fading.has(t.id);
        return (
          <li key={t.id} className="flex items-center gap-2">
            <button
              onClick={() => complete(t)}
              aria-label="Complete task"
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-sparrow-rule transition hover:border-sparrow-green hover:bg-sparrow-sage"
            >
              {isFading && <span className="h-2.5 w-2.5 rounded-full bg-sparrow-green" />}
            </button>
            <button
              onClick={() => ctx.onOpenTask(t)}
              className={`flex flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-sparrow-mist ${
                isFading ? 'text-sparrow-gray line-through opacity-50' : ''
              }`}
            >
              <span className="flex items-center gap-2 text-sm text-sparrow-ink">
                <span className={`h-2 w-2 rounded-full ${tier.dot}`} aria-hidden />
                {t.title}
              </span>
              <span className="shrink-0 text-xs text-sparrow-gray">{dueLabel(t.due_date, ctx.today)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Triage inbox ──────────────────────────────────────────────────────
function TriageWidget({ ctx }: { ctx: WidgetContext }) {
  const pending = ctx.tasks.filter((t) => t.assignee_id === ctx.me.id && t.triage_status === 'pending');

  async function accept(id: string) {
    await acceptTask(id);
    ctx.onChanged();
  }
  async function defer(id: string, days: number) {
    await deferTask(id, addDays(ctx.today, days));
    ctx.onChanged();
  }
  async function pushBack(t: TaskWithPeople) {
    const note = window.prompt('Send a quick note back to the assigner:');
    if (note === null) return;
    await pushBackTask(t, note.trim() || 'No reason given', ctx.me.id);
    ctx.onChanged();
  }

  if (pending.length === 0) return <Empty>No incoming tasks — you're all caught up. ✨</Empty>;

  return (
    <ul className="space-y-2">
      {pending.map((t) => (
        <li key={t.id} className="rounded-lg border border-sparrow-rule px-3 py-2">
          <p className="text-sm font-medium text-sparrow-ink">{t.title}</p>
          <p className="text-xs text-sparrow-gray">
            Assigned by {t.creator?.full_name ?? 'the system'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <button onClick={() => void accept(t.id)} className="rounded-md bg-sparrow-green px-2 py-1 font-medium text-white hover:bg-sparrow-green-dark">
              Accept
            </button>
            <button onClick={() => void defer(t.id, 1)} className="rounded-md border border-sparrow-rule px-2 py-1 text-sparrow-gray hover:text-sparrow-ink">
              → Tomorrow
            </button>
            <button onClick={() => void defer(t.id, 7)} className="rounded-md border border-sparrow-rule px-2 py-1 text-sparrow-gray hover:text-sparrow-ink">
              → Next week
            </button>
            {t.created_by && (
              <button onClick={() => void pushBack(t)} className="rounded-md border border-sparrow-rule px-2 py-1 text-sparrow-gray hover:text-sparrow-ink">
                Push back
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Notifications ─────────────────────────────────────────────────────
function describe(n: AppNotification): string {
  const who = n.actor?.full_name ?? 'Someone';
  return n.type === 'assigned' ? `${who} assigned you a task` : `${who} commented on a task`;
}

function NotificationsWidget({ ctx }: { ctx: WidgetContext }) {
  const items = ctx.notifications;
  const unread = items.filter((n) => !n.read).length;

  async function open(n: AppNotification) {
    if (!n.read) await markRead(n.id);
    const t = n.task_id ? ctx.tasks.find((x) => x.id === n.task_id) : undefined;
    if (t) ctx.onOpenTask(t);
    ctx.onChanged();
  }
  async function clearAll() {
    await markAllRead();
    ctx.onChanged();
  }

  if (items.length === 0) return <Empty>You're all caught up.</Empty>;
  return (
    <>
      <ul className="space-y-1">
        {items.slice(0, 6).map((n) => (
          <li key={n.id}>
            <button
              onClick={() => void open(n)}
              className={`block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-sparrow-mist ${
                n.read ? '' : 'bg-sparrow-sage/40'
              }`}
            >
              <p className="text-sm text-sparrow-ink">{describe(n)}</p>
              {n.body && <p className="truncate text-xs text-sparrow-gray">{n.body}</p>}
            </button>
          </li>
        ))}
      </ul>
      {unread > 0 && (
        <button onClick={() => void clearAll()} className="mt-2 text-xs text-sparrow-green hover:underline">
          Mark all read
        </button>
      )}
    </>
  );
}

// ── Quick wins ────────────────────────────────────────────────────────
function QuickWinsWidget({ ctx }: { ctx: WidgetContext }) {
  if (ctx.wins.length === 0) return <Empty>Wins will show up here as work lands. 🎉</Empty>;

  async function note(id: string) {
    const text = window.prompt('Add a note to this win:');
    if (!text) return;
    await addQuickWinNote(id, text.trim());
    ctx.onChanged();
  }

  return (
    <ul className="space-y-2">
      {ctx.wins.slice(0, 5).map((w) => (
        <li key={w.id} className="flex gap-2">
          <span aria-hidden>{QUICK_WIN_EMOJI[w.kind]}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-sparrow-ink">{w.title}</p>
            {w.detail && <p className="text-xs text-sparrow-gray">{w.detail}</p>}
            {w.note ? (
              <p className="mt-0.5 text-xs italic text-sparrow-gray">“{w.note}”</p>
            ) : (
              <button onClick={() => void note(w.id)} className="mt-0.5 text-xs text-sparrow-green hover:underline">
                + Add a note
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Upcoming meetings (today + next 2 days) ───────────────────────────
function timeLabel(d: Date, allDay: boolean): string {
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  if (allDay) return `${day} · all day`;
  return `${day} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function UpcomingMeetingsWidget({ ctx }: { ctx: WidgetContext }) {
  const from = new Date(ctx.today + 'T00:00:00');
  const to = new Date(from);
  to.setDate(to.getDate() + 3);
  const occ = expandEvents(ctx.events, from, to).slice(0, 6);

  if (occ.length === 0) return <Empty>Nothing scheduled in the next few days.</Empty>;

  return (
    <ul className="space-y-1.5">
      {occ.map((o, i) => (
        <li key={`${o.event.id}-${i}`} className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${KIND_PILL[o.event.kind]}`}>
            {timeLabel(o.occursAt, o.event.all_day)}
          </span>
          <span className="truncate text-sm text-sparrow-ink">{o.event.title}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Mini calendar (this month; dots on days with events) ──────────────
function MiniCalendarWidget({ ctx }: { ctx: WidgetContext }) {
  const ref = new Date(ctx.today + 'T00:00:00');
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59);
  const busy = new Set(expandEvents(ctx.events, monthStart, monthEnd).map((o) => o.occursAt.getDate()));

  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <p className="mb-2 text-center text-sm font-medium text-sparrow-ink">
        {ref.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </p>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="text-sparrow-gray">{d}</span>
        ))}
        {cells.map((d, i) => {
          const isToday = d === ref.getDate();
          return (
            <button
              key={i}
              onClick={() => d && ctx.onNavigate('calendar')}
              disabled={!d}
              className={`relative grid h-7 place-items-center rounded-md ${
                isToday ? 'bg-sparrow-green font-semibold text-white' : d ? 'hover:bg-sparrow-mist' : ''
              }`}
            >
              {d}
              {d && busy.has(d) && !isToday && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-sparrow-gold" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Team pulse (managers/admins) ──────────────────────────────────────
function TeamPulseWidget({ ctx }: { ctx: WidgetContext }) {
  if (ctx.reports.length === 0) return <Empty>No direct reports.</Empty>;

  const stat = (id: string) => {
    const theirs = ctx.tasks.filter((t) => t.assignee_id === id && t.status !== 'done' && t.triage_status === 'accepted');
    const overdue = theirs.filter((t) => bucketFor(t.due_date, false, ctx.today) === 'overdue').length;
    return { open: theirs.length, overdue };
  };

  return (
    <ul className="space-y-1.5">
      {ctx.reports.map((r) => {
        const s = stat(r.id);
        const color = s.overdue > 0 ? 'bg-priority-p1' : s.open > 0 ? 'bg-sparrow-gold' : 'bg-sparrow-green';
        return (
          <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 text-sparrow-ink">
              <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden />
              {r.full_name}
            </span>
            <span className="text-xs text-sparrow-gray">
              {s.open} open{s.overdue > 0 ? ` · ${s.overdue} overdue` : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ── My week (tasks + events, Mon–Sun) ────────────────────────────────
function getWeekBounds(today: string): { weekStart: string; weekEnd: string } {
  const d = new Date(today + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { weekStart: isoDate(monday), weekEnd: isoDate(sunday) };
}

function MyWeekWidget({ ctx }: { ctx: WidgetContext }) {
  const { weekStart, weekEnd } = getWeekBounds(ctx.today);

  const weekEvents = expandEvents(
    ctx.events,
    new Date(weekStart + 'T00:00:00'),
    new Date(weekEnd + 'T23:59:59'),
  );

  const myTasks = ctx.tasks.filter(
    (t) =>
      t.assignee_id === ctx.me.id &&
      t.triage_status === 'accepted' &&
      t.status !== 'done' &&
      t.due_date &&
      t.due_date >= weekStart &&
      t.due_date <= weekEnd,
  );

  const monday = new Date(weekStart + 'T12:00:00');
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dStr = isoDate(d);
    return {
      date: dStr,
      label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      isToday: dStr === ctx.today,
    };
  });

  const hasAnything = weekEvents.length > 0 || myTasks.length > 0;
  if (!hasAnything) return <Empty>Nothing on the calendar this week.</Empty>;

  return (
    <div className="space-y-4">
      {days.map(({ date, label, isToday }) => {
        const dayEvents = weekEvents.filter((o) => isoDate(o.occursAt) === date);
        const dayTasks = myTasks.filter((t) => t.due_date === date);
        if (dayEvents.length === 0 && dayTasks.length === 0) return null;

        return (
          <div key={date}>
            <p className={`mb-1.5 text-xs font-semibold ${isToday ? 'text-sparrow-green' : 'text-sparrow-gray'}`}>
              {label}{isToday ? ' · Today' : ''}
            </p>
            <div className="space-y-1">
              {dayEvents.map((o, idx) => (
                <div key={`${o.event.id}-${idx}`} className="flex items-center gap-2 text-xs text-sparrow-ink">
                  <span className="shrink-0 text-sparrow-gray">
                    {o.event.all_day
                      ? 'All day'
                      : o.occursAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="truncate">{o.event.title}</span>
                </div>
              ))}
              {dayTasks.map((t) => {
                const tier = TIER_META[tierForPriority(t.priority)];
                return (
                  <button
                    key={t.id}
                    onClick={() => ctx.onOpenTask(t)}
                    className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-sparrow-mist"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${tier.dot}`} aria-hidden />
                    <span className="truncate text-sparrow-ink">{t.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Catalog (ordered = the default layout, filtered by availability) ──
export const WIDGET_CATALOG: WidgetDef[] = [
  { key: 'today_tasks',       label: 'My tasks — today',    Comp: TodayTasksWidget },
  { key: 'my_week',           label: 'My week',             Comp: MyWeekWidget, wide: true },
  { key: 'triage',            label: 'Incoming tasks',      Comp: TriageWidget },
  { key: 'team_pulse',        label: 'Team pulse',          Comp: TeamPulseWidget, managerOnly: true },
  { key: 'upcoming_meetings', label: 'Upcoming meetings',   Comp: UpcomingMeetingsWidget },
  { key: 'notifications',     label: 'Notifications',       Comp: NotificationsWidget },
  { key: 'quick_wins',        label: 'Quick wins',          Comp: QuickWinsWidget },
  { key: 'mini_calendar',     label: 'Calendar',            Comp: MiniCalendarWidget },
];

/** Widgets this user is allowed to place, in default order. */
export function availableWidgets(showTeam: boolean): WidgetDef[] {
  return WIDGET_CATALOG.filter((w) => !w.managerOnly || showTeam);
}

export function widgetDef(key: WidgetKey): WidgetDef | undefined {
  return WIDGET_CATALOG.find((w) => w.key === key);
}
