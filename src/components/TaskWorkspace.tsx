import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { setTaskStatus, updateTask } from '@/lib/data';
import type { Profile, TaskComment, TaskStatus, TaskWithPeople } from '@/lib/types';
import { TaskPanel } from './TaskPanel';
import { TaskListView } from './tasks/TaskListView';
import { TaskBoardView } from './tasks/TaskBoardView';
import { TaskCalendarView } from './tasks/TaskCalendarView';
import { TaskArchiveView } from './tasks/TaskArchiveView';

type Layout = 'list' | 'board' | 'calendar' | 'archive';
const LAYOUTS: { value: Layout; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'board', label: 'Board' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'archive', label: 'Archive' },
];

interface Props {
  currentUser: Profile;
  profiles: Profile[];
  tasks: TaskWithPeople[];
  comments: TaskComment[];
  today: string;
  onChanged: () => void;
  topSlot?: ReactNode;
  onHelp?: () => void;
}

export function TaskWorkspace({ currentUser, profiles, tasks, comments, today, onChanged, topSlot, onHelp }: Props) {
  const [, startTransition] = useTransition();
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [panelTask, setPanelTask] = useState<TaskWithPeople | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Remember the last-used view per the brief ("system remembers which view each user was last in").
  const [layout, setLayout] = useState<Layout>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('sparrow.taskView') : null;
    return saved === 'board' || saved === 'calendar' || saved === 'archive' ? saved : 'list';
  });
  useEffect(() => {
    window.localStorage.setItem('sparrow.taskView', layout);
  }, [layout]);

  const isAdmin = currentUser.role === 'admin';
  const reports = useMemo(
    () =>
      profiles.filter((p) =>
        isAdmin
          ? p.id !== currentUser.id
          : p.manager_email?.toLowerCase() === currentUser.email.toLowerCase(),
      ),
    [profiles, isAdmin, currentUser],
  );
  const showTeam = reports.length > 0;

  // "My tasks" = tasks assigned to me. Tasks I created but delegated away show under My Team.
  const mineTasks = useMemo(
    () => tasks.filter((t) => t.assignee_id === currentUser.id),
    [tasks, currentUser.id],
  );
  const teamTasks = useMemo(() => {
    const reportIds = new Set(reports.map((r) => r.id));
    return tasks.filter((t) => t.assignee_id !== currentUser.id && reportIds.has(t.assignee_id));
  }, [tasks, reports, currentUser.id]);

  const visible =
    scope === 'mine'
      ? mineTasks
      : teamTasks.filter((t) => teamFilter === 'all' || t.assignee_id === teamFilter);

  // Done tasks go to Archive only; list/board/calendar show active work.
  const activeTasks = useMemo(() => visible.filter((t) => t.status !== 'done'), [visible]);
  const doneTasks = useMemo(() => visible.filter((t) => t.status === 'done'), [visible]);

  function openNew() {
    setPanelTask(null);
    setPanelOpen(true);
  }
  function openEdit(t: TaskWithPeople) {
    setPanelTask(t);
    setPanelOpen(true);
  }
  function toggleDone(t: TaskWithPeople) {
    startTransition(async () => {
      await setTaskStatus(t.id, t.status === 'done' ? 'todo' : 'done');
      onChanged();
    });
  }
  function moveToStatus(taskId: string, status: TaskStatus) {
    const t = tasks.find((x) => x.id === taskId);
    if (!t || t.status === status) return;
    startTransition(async () => {
      await setTaskStatus(taskId, status);
      onChanged();
    });
  }
  function moveToDate(taskId: string, dateIso: string) {
    const t = tasks.find((x) => x.id === taskId);
    if (!t || t.due_date === dateIso) return;
    startTransition(async () => {
      await updateTask(taskId, { due_date: dateIso });
      onChanged();
    });
  }

  const firstName = currentUser.full_name.split(' ')[0];
  const dateLabel = new Date(today + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const showAssignee = scope === 'team';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {topSlot}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Good to see you, {firstName}.</h1>
          <p className="mt-1 text-sm text-sparrow-gray">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {onHelp && (
            <button
              onClick={onHelp}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-sparrow-rule text-sm font-semibold text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
              aria-label="My Tasks help"
              title="How My Tasks works"
            >
              ?
            </button>
          )}
          {layout !== 'archive' && (
            <button onClick={openNew} className="btn-primary">
              + New task
            </button>
          )}
        </div>
      </div>

      {/* Controls: view switcher (left) + scope toggle (right) */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={LAYOUTS}
          value={layout}
          onChange={(v) => setLayout(v as Layout)}
        />
        {showTeam && (
          <Segmented
            options={[
              { value: 'mine', label: 'My tasks' },
              { value: 'team', label: 'My team' },
            ]}
            value={scope}
            onChange={(v) => setScope(v as 'mine' | 'team')}
          />
        )}
      </div>

      {scope === 'team' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <PersonTab label="Everyone" active={teamFilter === 'all'} onClick={() => setTeamFilter('all')} />
          {reports.map((r) => (
            <PersonTab
              key={r.id}
              label={r.full_name.split(' ')[0]}
              active={teamFilter === r.id}
              onClick={() => setTeamFilter(r.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-8">
        {layout === 'list' && (
          <TaskListView
            tasks={activeTasks}
            today={today}
            currentUserId={currentUser.id}
            showAssignee={showAssignee}
            onToggle={toggleDone}
            onOpen={openEdit}
          />
        )}
        {layout === 'board' && (
          <TaskBoardView
            tasks={activeTasks}
            today={today}
            showAssignee={showAssignee}
            onOpen={openEdit}
            onMoveStatus={moveToStatus}
          />
        )}
        {layout === 'calendar' && (
          <TaskCalendarView tasks={activeTasks} today={today} onOpen={openEdit} onMoveDate={moveToDate} />
        )}
        {layout === 'archive' && (
          <TaskArchiveView
            tasks={doneTasks}
            today={today}
            showAssignee={showAssignee}
            onOpen={openEdit}
            onToggle={toggleDone}
          />
        )}
      </div>

      <TaskPanel
        open={panelOpen}
        task={panelTask}
        profiles={profiles}
        currentUser={currentUser}
        comments={panelTask ? comments.filter((c) => c.task_id === panelTask.id) : []}
        today={today}
        onClose={() => setPanelOpen(false)}
        onChanged={onChanged}
      />
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-sparrow-rule bg-white p-1 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            value === o.value ? 'bg-sparrow-green text-white' : 'text-sparrow-gray hover:text-sparrow-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PersonTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition ${
        active
          ? 'border-sparrow-green bg-sparrow-green text-white'
          : 'border-sparrow-rule bg-white text-sparrow-gray hover:text-sparrow-ink'
      }`}
    >
      {label}
    </button>
  );
}
