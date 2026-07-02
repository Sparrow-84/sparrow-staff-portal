import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchComments, fetchProfiles, fetchTasks } from '@/lib/data';
import { fetchNotifications, type AppNotification } from '@/lib/social';
import { fetchQuickWins, type QuickWin } from '@/lib/quickwins';
import { fetchCalendar, type CalendarEvent } from '@/lib/calendar';
import { fetchSettings, saveSettings } from '@/lib/settings';
import { isoDate } from '@/lib/tasks';
import type { Profile, TaskComment, TaskWithPeople } from '@/lib/types';
import { AnnouncementBar } from '../AnnouncementBar';
import { TaskPanel } from '../TaskPanel';
import type { View } from '../Sidebar';
import {
  availableWidgets,
  widgetDef,
  WidgetCard,
  type WidgetContext,
  type WidgetKey,
} from './widgets';
import { DashboardWelcome, useDashboardWelcome } from './DashboardWelcome';
import { DashboardHelpModal } from './DashboardHelpModal';

function reorderByIndex(keys: WidgetKey[], drag: WidgetKey, insertAt: number): WidgetKey[] {
  const without = keys.filter((k) => k !== drag);
  without.splice(Math.min(insertAt, without.length), 0, drag);
  return without;
}

export function WidgetHome({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<TaskWithPeople[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [wins, setWins] = useState<QuickWin[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [layout, setLayout] = useState<WidgetKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WidgetKey[]>([]);
  const [dragKey, setDragKey] = useState<WidgetKey | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const [weekendVisible, setWeekendVisible] = useState(false);

  const [panelTask, setPanelTask] = useState<TaskWithPeople | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { welcomeOpen, dismissWelcome, reopenWelcome } = useDashboardWelcome();

  const me = profile;
  const isAdmin = me?.role === 'admin';

  const reports = useMemo(() => {
    if (!me) return [];
    return profiles.filter((p) =>
      isAdmin ? p.id !== me.id : p.manager_email?.toLowerCase() === me.email.toLowerCase(),
    );
  }, [profiles, isAdmin, me]);
  const showTeam = reports.length > 0;

  const load = useCallback(async () => {
    if (!me) return;
    try {
      const [p, t, c, n, w, e, s] = await Promise.all([
        fetchProfiles(),
        fetchTasks(),
        fetchComments(),
        fetchNotifications(),
        fetchQuickWins(),
        fetchCalendar(),
        fetchSettings(me.id),
      ]);
      setProfiles(p);
      setTasks(t);
      setComments(c);
      setNotifications(n);
      setWins(w);
      setEvents(e);
      setWeekendVisible((s?.prefs?.show_weekends as boolean) ?? false);

      const teamVisible = isAdmin
        ? p.some((x) => x.id !== me.id)
        : p.some((x) => x.manager_email?.toLowerCase() === me.email.toLowerCase());
      const allowed = availableWidgets(teamVisible).map((d) => d.key);
      const saved = (s?.home_layout as WidgetKey[] | null) ?? null;
      const base = saved && saved.length ? saved : allowed;
      setLayout(base.filter((k) => allowed.includes(k)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, [me, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const ctx: WidgetContext | null = useMemo(() => {
    if (!me) return null;
    return {
      me,
      tasks,
      comments,
      notifications,
      wins,
      events,
      reports,
      today: isoDate(new Date()),
      onChanged: load,
      onOpenTask: (t) => {
        setPanelTask(t);
        setPanelOpen(true);
      },
      onNavigate,
      weekendVisible,
      onToggleWeekend: () => {
        const next = !weekendVisible;
        setWeekendVisible(next);
        void saveSettings(me!.id, { prefs: { show_weekends: next } });
      },
    };
  }, [me, tasks, comments, notifications, wins, events, reports, load, onNavigate, weekendVisible]);

  if (!me || !ctx) return null;
  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading your dashboard…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  const shown = editing ? draft : layout;
  const notPlaced = availableWidgets(showTeam).filter((d) => !shown.includes(d.key));

  const isDragging = editing && dragKey !== null;
  const dragIsWide = dragKey ? (widgetDef(dragKey)?.wide ?? false) : false;
  const without = isDragging ? shown.filter((k) => k !== dragKey) : shown;
  type DisplayItem = WidgetKey | '__placeholder__';
  let displayItems: DisplayItem[];
  if (!isDragging) {
    displayItems = shown;
  } else if (dropIndex !== null) {
    displayItems = [
      ...without.slice(0, dropIndex),
      '__placeholder__',
      ...without.slice(dropIndex),
    ] as DisplayItem[];
  } else {
    displayItems = shown; // dragging but not over anything yet — keep original layout, card will fade
  }
  const firstName = me.full_name.split(' ')[0];
  const dateLabel = new Date(ctx.today + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  function startEdit() {
    setDraft(layout);
    setEditing(true);
  }
  async function saveEdit() {
    setLayout(draft);
    setEditing(false);
    setAddOpen(false);
    try {
      await saveSettings(me!.id, { home_layout: draft });
    } catch {
      /* layout still applied locally; persistence is best-effort */
    }
  }
  function cancelEdit() {
    setEditing(false);
    setAddOpen(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <DashboardWelcome open={welcomeOpen} onDismiss={dismissWelcome} />
      <DashboardHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onReplayTour={() => { setHelpOpen(false); reopenWelcome(); }}
      />

      <AnnouncementBar />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Good to see you, {firstName}.</h1>
          <p className="mt-1 text-sm text-sparrow-gray">{dateLabel}</p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            {notPlaced.length > 0 && (
              <div className="relative">
                <button onClick={() => setAddOpen((o) => !o)} className="btn-ghost border border-sparrow-rule">
                  + Add widget
                </button>
                {addOpen && (
                  <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-sparrow-rule bg-white shadow-card">
                    {notPlaced.map((d) => (
                      <button
                        key={d.key}
                        onClick={() => {
                          setDraft((cur) => [...cur, d.key]);
                          setAddOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-sparrow-mist"
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={cancelEdit} className="btn-ghost">Cancel</button>
            <button onClick={() => void saveEdit()} className="btn-primary">Done</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHelpOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-sparrow-rule text-sm font-semibold text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
              aria-label="Dashboard help"
              title="Dashboard overview"
            >
              ?
            </button>
            <button onClick={startEdit} className="btn-ghost border border-sparrow-rule">Edit home</button>
          </div>
        )}
      </div>

      {editing && (
        <p className="mt-3 text-xs text-sparrow-gray">
          Drag the top bar of any card to reorder. Remove with &times;. Add more with &ldquo;+ Add widget.&rdquo;
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {displayItems.map((item, _i) => {
          if (item === '__placeholder__') {
            return (
              <div
                key="__placeholder__"
                className={`min-h-[8rem] rounded-2xl border-2 border-dashed border-sparrow-green bg-sparrow-sage/40 flex items-center justify-center${dragIsWide ? ' sm:col-span-2' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragKey !== null && dropIndex !== null) {
                    setDraft((cur) => reorderByIndex(cur, dragKey, dropIndex));
                  }
                  setDragKey(null);
                  setDropIndex(null);
                }}
              >
                <span className="text-xs font-medium text-sparrow-green">Drop here</span>
              </div>
            );
          }

          const key = item as WidgetKey;
          const def = widgetDef(key);
          if (!def) return null;
          const body = (
            <WidgetCard title={def.label} headerRight={def.HeaderRight ? <def.HeaderRight ctx={ctx} /> : undefined}>
              <def.Comp ctx={ctx} />
            </WidgetCard>
          );
          if (!editing) return <div key={key} className={def.wide ? 'sm:col-span-2' : ''}>{body}</div>;

          const isBeingDragged = dragKey === key;
          const indexInWithout = without.indexOf(key);

          return (
            <div
              key={key}
              draggable
              onDragStart={(e) => {
                const ghost = document.createElement('div');
                ghost.textContent = def.label;
                ghost.style.cssText =
                  'position:absolute;top:-9999px;background:#1E4D30;color:white;padding:6px 14px;border-radius:6px;font-size:12px;font-family:sans-serif;white-space:nowrap;';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 18);
                requestAnimationFrame(() => document.body.removeChild(ghost));
                setDragKey(key);
                setDropIndex(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragKey || dragKey === key) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const insertBefore = e.clientY < rect.top + rect.height / 2;
                const next = insertBefore ? indexInWithout : indexInWithout + 1;
                if (next !== dropIndex) setDropIndex(next);
              }}
              onDrop={() => {
                if (dragKey !== null && dropIndex !== null) {
                  setDraft((cur) => reorderByIndex(cur, dragKey, dropIndex));
                }
                setDragKey(null);
                setDropIndex(null);
              }}
              onDragEnd={() => {
                setDragKey(null);
                setDropIndex(null);
              }}
              className={[
                'rounded-2xl ring-2 ring-dashed ring-sparrow-rule transition-opacity',
                def.wide ? 'sm:col-span-2' : '',
                isBeingDragged && dropIndex !== null ? 'opacity-0 pointer-events-none' : '',
                isBeingDragged && dropIndex === null ? 'opacity-30' : '',
              ].join(' ')}
            >
              <div className="flex cursor-grab select-none items-center justify-between rounded-t-2xl bg-sparrow-mist px-3 py-2 text-xs text-sparrow-gray active:cursor-grabbing">
                <span aria-hidden>⠿ Drag to reorder</span>
                <button
                  onClick={() => setDraft((cur) => cur.filter((k) => k !== key))}
                  className="cursor-default rounded px-1.5 font-semibold hover:bg-sparrow-rule/60 hover:text-sparrow-ink"
                  aria-label={`Remove ${def.label}`}
                >
                  ×
                </button>
              </div>
              {body}
            </div>
          );
        })}
      </div>

      {shown.length === 0 && (
        <p className="mt-10 text-center text-sm text-sparrow-gray">
          Your home is empty. {editing ? 'Add a widget to get started.' : 'Click "Edit home" to add widgets.'}
        </p>
      )}

      <TaskPanel
        open={panelOpen}
        task={panelTask}
        profiles={profiles}
        currentUser={me}
        comments={panelTask ? comments.filter((c) => c.task_id === panelTask.id) : []}
        today={ctx.today}
        onClose={() => setPanelOpen(false)}
        onChanged={load}
      />
    </div>
  );
}
