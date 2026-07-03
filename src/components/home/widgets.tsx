import { useState, type ReactNode } from 'react';
import type { Profile, TaskComment, TaskStatus, TaskWithPeople } from '@/lib/types';
import type { AppNotification } from '@/lib/social';
import type { QuickWin } from '@/lib/quickwins';
import type { CalendarEvent } from '@/lib/calendar';
import type { View } from '../Sidebar';
import { acceptTask, deferTask, pushBackTask, setTaskStatus } from '@/lib/data';
import { markAllRead, markRead } from '@/lib/social';
import { addQuickWinNote, QUICK_WIN_EMOJI } from '@/lib/quickwins';
import { expandEvents, KIND_LABEL, KIND_PILL } from '@/lib/calendar';
import { bucketFor, dueLabel, isoDate, PRIORITY_META, TIER_META, tierForPriority } from '@/lib/tasks';

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
  weekendVisible: boolean;
  onToggleWeekend: () => void;
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
  HeaderRight?: (props: { ctx: WidgetContext }) => ReactNode;
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
        const meta = PRIORITY_META[t.priority];
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
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden />
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
  const unscheduled = ctx.tasks.filter(
    (t) =>
      t.assignee_id === ctx.me.id &&
      t.triage_status === 'accepted' &&
      !t.due_date &&
      t.status !== 'done',
  );

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

  if (pending.length === 0 && unscheduled.length === 0)
    return <Empty>No incoming tasks — you're all caught up. ✨</Empty>;

  const showLabels = pending.length > 0 && unscheduled.length > 0;

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <div>
          {showLabels && (
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Needs response
            </p>
          )}
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
        </div>
      )}
      {unscheduled.length > 0 && (
        <div>
          {showLabels && (
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Unscheduled
            </p>
          )}
          <ul className="space-y-2">
            {unscheduled.map((t) => (
              <li key={t.id} className="rounded-lg border border-sparrow-rule px-3 py-2">
                <p className="text-sm font-medium text-sparrow-ink">{t.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <button onClick={() => void defer(t.id, 0)} className="rounded-md bg-sparrow-green px-2 py-1 font-medium text-white hover:bg-sparrow-green-dark">
                    Do today
                  </button>
                  <button onClick={() => void defer(t.id, 1)} className="rounded-md border border-sparrow-rule px-2 py-1 text-sparrow-gray hover:text-sparrow-ink">
                    → Tomorrow
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Notifications ─────────────────────────────────────────────────────
function describe(n: AppNotification): string {
  const who = n.actor?.full_name ?? 'Someone';
  if (n.type === 'mentioned') return `${who} mentioned you`;
  return `${who} commented on a task`;
}

function NotificationsWidget({ ctx }: { ctx: WidgetContext }) {
  // Only show unread comments/mentions — assigned notifications live in Incoming Tasks
  const displayItems = ctx.notifications
    .filter((n) => !n.read && n.type !== 'assigned')
    .slice(0, 6);

  async function open(n: AppNotification) {
    await markRead(n.id);
    const t = n.task_id ? ctx.tasks.find((x) => x.id === n.task_id) : undefined;
    if (t) ctx.onOpenTask(t);
    ctx.onChanged();
  }
  async function clearAll() {
    await markAllRead();
    ctx.onChanged();
  }

  if (displayItems.length === 0) return <Empty>You're all caught up.</Empty>;
  return (
    <>
      <ul className="space-y-1">
        {displayItems.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => void open(n)}
              className="block w-full rounded-lg bg-sparrow-sage/40 px-2 py-1.5 text-left transition hover:bg-sparrow-mist"
            >
              <p className="text-sm text-sparrow-ink">{describe(n)}</p>
              {n.body && <p className="truncate text-xs text-sparrow-gray">{n.body}</p>}
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => void clearAll()} className="mt-2 text-xs text-sparrow-green hover:underline">
        Mark all read
      </button>
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
  const todayStart = new Date(ctx.today + 'T00:00:00');
  const to = new Date(todayStart);
  to.setDate(to.getDate() + 3);
  const now = new Date();
  const occ = expandEvents(ctx.events, todayStart, to)
    .filter((o) => {
      if (o.event.all_day) return true;
      if (!o.event.ends_at) return o.occursAt >= now;
      const durationMs = new Date(o.event.ends_at).getTime() - new Date(o.event.starts_at).getTime();
      return new Date(o.occursAt.getTime() + durationMs) >= now;
    })
    .slice(0, 6);

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
const WEEK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

type WeekTooltipState =
  | { kind: 'task'; task: TaskWithPeople; x: number; y: number }
  | { kind: 'event'; event: CalendarEvent; occursAt: Date; x: number; y: number };

function WeekTooltip({ state }: { state: WeekTooltipState }) {
  const left = state.x > window.innerWidth - 290 ? state.x - 274 : state.x + 14;
  const top = state.y + 16;
  if (state.kind === 'task') {
    const tier = TIER_META[tierForPriority(state.task.priority)];
    return (
      <div className="pointer-events-none fixed z-50 w-64 rounded-lg border border-sparrow-rule bg-white p-3 shadow-lg" style={{ left, top }}>
        <p className="text-sm font-medium leading-snug text-sparrow-ink">{state.task.title}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${tier.dot}`} aria-hidden />
          <span className={`text-xs font-medium ${tier.text}`}>{tier.label}</span>
        </div>
        <p className="mt-1 text-xs text-sparrow-gray">{WEEK_STATUS_LABELS[state.task.status]}</p>
        {state.task.notes && <p className="mt-2 line-clamp-3 text-xs text-sparrow-ink/70">{state.task.notes}</p>}
      </div>
    );
  }
  return (
    <div className="pointer-events-none fixed z-50 w-64 rounded-lg border border-sparrow-rule bg-white p-3 shadow-lg" style={{ left, top }}>
      <p className="text-sm font-medium leading-snug text-sparrow-ink">{state.event.title}</p>
      <p className="mt-1 text-xs text-sparrow-gray">{state.event.is_personal ? 'Personal — only you can see this' : KIND_LABEL[state.event.kind]}</p>
      {!state.event.all_day && (
        <p className="mt-1 text-xs text-sparrow-gray">
          {state.occursAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </p>
      )}
      {state.event.location && <p className="mt-1 text-xs text-sparrow-gray">{state.event.location}</p>}
    </div>
  );
}

function getWeekBounds(today: string): { weekStart: string; weekEnd: string } {
  const d = new Date(today + 'T00:00:00');
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay()); // back to this week's Sunday
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { weekStart: isoDate(sunday), weekEnd: isoDate(saturday) };
}

function MyWeekWidget({ ctx }: { ctx: WidgetContext }) {
  const { weekStart, weekEnd } = getWeekBounds(ctx.today);
  const [tooltip, setTooltip] = useState<WeekTooltipState | null>(null);

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

  const weekSunday = new Date(weekStart + 'T12:00:00');
  const allDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekSunday);
    d.setDate(weekSunday.getDate() + i);
    const dStr = isoDate(d);
    const dow = d.getDay();
    return {
      date: dStr,
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: dStr === ctx.today,
      isPast: dStr < ctx.today,
      isWeekend: dow === 0 || dow === 6,
    };
  });

  const days = allDays.filter((d) => d.isToday || !d.isWeekend || ctx.weekendVisible);

  return (
    <>
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => ctx.onNavigate('calendar')}
          className="text-xs text-sparrow-green hover:underline"
        >
          My calendar →
        </button>
      </div>
      <div className="flex gap-1 overflow-hidden">
        {days.map(({ date, weekday, dayNum, isToday, isPast }) => {
          const dayEvents = weekEvents.filter((o) => isoDate(o.occursAt) === date);
          const dayTasks = myTasks.filter((t) => t.due_date === date);

          if (isPast && !isToday) {
            const hasContent = dayEvents.length > 0 || dayTasks.length > 0;
            return (
              <div key={date} className="flex w-8 shrink-0 flex-col items-center py-1">
                <p className="text-[9px] font-medium uppercase leading-none text-sparrow-gray opacity-50">
                  {weekday.charAt(0)}
                </p>
                <p className="mt-0.5 text-[10px] leading-none text-sparrow-gray opacity-40">{dayNum}</p>
                {hasContent && (
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-sparrow-gray opacity-30" aria-hidden />
                )}
              </div>
            );
          }

          return (
            <div
              key={date}
              className={`min-h-[100px] min-w-0 flex-1 rounded-lg p-1.5 ${
                isToday
                  ? 'bg-sparrow-green/10 ring-1 ring-sparrow-green/30'
                  : 'bg-sparrow-mist/40'
              }`}
            >
              <div className="mb-1.5 text-center">
                <p className={`text-[10px] font-medium uppercase tracking-wide ${isToday ? 'text-sparrow-green' : 'text-sparrow-gray'}`}>
                  {weekday}
                </p>
                <p className={`text-sm font-semibold leading-none ${isToday ? 'text-sparrow-green' : 'text-sparrow-ink'}`}>
                  {dayNum}
                </p>
              </div>
              {dayEvents.map((o, idx) => (
                <div
                  key={`${o.event.id}-${idx}`}
                  className={`mb-0.5 truncate rounded px-1 py-0.5 text-[10px] ${o.event.is_personal ? 'bg-slate-100 text-slate-500' : 'bg-sparrow-green/15 text-sparrow-green'}`}
                  onMouseEnter={(e) => setTooltip({ kind: 'event', event: o.event, occursAt: o.occursAt, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {!o.event.all_day && (
                    <span className="mr-0.5 opacity-70">
                      {o.occursAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                  {o.event.is_personal && <span className="mr-0.5">·</span>}
                  {o.event.title}
                </div>
              ))}
              {dayTasks.map((t) => {
                const meta = PRIORITY_META[t.priority];
                return (
                  <button
                    key={t.id}
                    onClick={() => ctx.onOpenTask(t)}
                    className="mb-0.5 flex w-full items-center gap-1 rounded bg-white/60 px-1 py-0.5 text-left text-[10px] hover:bg-white"
                    onMouseEnter={(e) => setTooltip({ kind: 'task', task: t, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
                    <span className="truncate text-sparrow-ink">{t.title}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {tooltip && <WeekTooltip state={tooltip} />}
    </>
  );
}

function MyWeekHeaderRight({ ctx }: { ctx: WidgetContext }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-sparrow-gray">
      <input
        type="checkbox"
        checked={ctx.weekendVisible}
        onChange={ctx.onToggleWeekend}
        className="h-3 w-3 accent-sparrow-green"
      />
      Weekends
    </label>
  );
}

// ── Catalog (ordered = the default layout, filtered by availability) ──
export const WIDGET_CATALOG: WidgetDef[] = [
  { key: 'today_tasks',       label: 'My tasks — today',    Comp: TodayTasksWidget },
  { key: 'my_week',           label: 'My week',             Comp: MyWeekWidget, HeaderRight: MyWeekHeaderRight },
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
