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

function reorder(keys: WidgetKey[], drag: WidgetKey, target: WidgetKey): WidgetKey[] {
  if (drag === target) return keys;
  const next = keys.filter((k) => k !== drag);
  const at = next.indexOf(target);
  next.splice(at, 0, drag);
  return next;
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
  const [addOpen, setAddOpen] = useState(false);

  const [panelTask, setPanelTask] = useState<TaskWithPeople | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

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
    };
  }, [me, tasks, comments, notifications, wins, events, reports, load, onNavigate]);

  if (!me || !ctx) return null;
  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading your dashboard…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  const shown = editing ? draft : layout;
  const notPlaced = availableWidgets(showTeam).filter((d) => !shown.includes(d.key));
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
          <button onClick={startEdit} className="btn-ghost border border-sparrow-rule">Edit home</button>
        )}
      </div>

      {editing && (
        <p className="mt-3 text-xs text-sparrow-gray">
          Drag a card by its handle to reorder. Remove with ×. Add more with “+ Add widget.”
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {shown.map((key) => {
          const def = widgetDef(key);
          if (!def) return null;
          const body = (
            <WidgetCard title={def.label}>
              <def.Comp ctx={ctx} />
            </WidgetCard>
          );
          if (!editing) return <div key={key}>{body}</div>;
          return (
            <div
              key={key}
              draggable
              onDragStart={() => setDragKey(key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragKey) setDraft((cur) => reorder(cur, dragKey, key));
                setDragKey(null);
              }}
              className={`rounded-2xl ring-2 ring-dashed ring-sparrow-rule ${dragKey === key ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center justify-between rounded-t-2xl bg-sparrow-mist px-3 py-1.5 text-xs text-sparrow-gray">
                <span className="cursor-grab select-none" aria-hidden>⠿ drag</span>
                <button
                  onClick={() => setDraft((cur) => cur.filter((k) => k !== key))}
                  className="rounded px-1.5 font-semibold hover:bg-sparrow-rule/60 hover:text-sparrow-ink"
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
          Your home is empty. {editing ? 'Add a widget to get started.' : 'Click “Edit home” to add widgets.'}
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
