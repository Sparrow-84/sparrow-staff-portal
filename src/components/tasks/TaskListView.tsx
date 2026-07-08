import { useMemo } from 'react';
import { BUCKETS, dueLabel, groupTasks } from '@/lib/tasks';
import type { TaskWithPeople } from '@/lib/types';
import { PriorityChip } from '../PriorityChip';
import { DeptTag } from '../DeptTag';
import { LabelPill } from '../LabelPill';

interface Props {
  tasks: TaskWithPeople[];
  today: string;
  currentUserId: string;
  showAssignee: boolean;
  onToggle: (task: TaskWithPeople) => void;
  onOpen: (task: TaskWithPeople) => void;
}

export function TaskListView({ tasks, today, currentUserId, showAssignee, onToggle, onOpen }: Props) {
  const groups = useMemo(() => groupTasks(tasks, today), [tasks, today]);

  if (tasks.length === 0) return <EmptyState />;

  return (
    <div className="space-y-8">
      {BUCKETS.map(({ key, label }) => {
        const items = groups[key];
        if (items.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              {label} <span className="text-sparrow-gray/70">· {items.length}</span>
            </h2>
            <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
              {items.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  today={today}
                  overdue={key === 'overdue'}
                  showAssignee={showAssignee}
                  currentUserId={currentUserId}
                  onToggle={() => onToggle(t)}
                  onOpen={() => onOpen(t)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <p className="rounded-xl border border-dashed border-sparrow-rule bg-white p-8 text-center text-sm text-sparrow-gray">
      Nothing here yet. Click <span className="font-medium text-sparrow-green">+ New task</span> to add one.
    </p>
  );
}

function TaskRow({
  task,
  today,
  overdue,
  showAssignee,
  currentUserId,
  onToggle,
  onOpen,
}: {
  task: TaskWithPeople;
  today: string;
  overdue: boolean;
  showAssignee: boolean;
  currentUserId: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const done = task.status === 'done';
  const assignedByOther = task.created_by !== task.assignee_id && task.assignee_id === currentUserId;

  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-sparrow-mist">
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        aria-label={done ? 'Mark not done' : 'Mark done'}
        className="h-4 w-4 shrink-0 cursor-pointer accent-sparrow-green"
      />
      <button onClick={onOpen} className="flex flex-1 items-center gap-3 text-left">
        <span className="flex-1">
          <span className={`text-sm ${done ? 'text-sparrow-gray line-through' : 'text-sparrow-ink'}`}>
            {task.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {task.label && task.label_color && (
              <LabelPill label={task.label} color={task.label_color} />
            )}
            {task.due_date && (
              <span className={`text-xs ${overdue ? 'font-medium text-priority-p1' : 'text-sparrow-gray'}`}>
                {dueLabel(task.due_date, today)}
              </span>
            )}
            {showAssignee && task.assignee && (
              <span className="text-xs text-sparrow-gray">{task.assignee.full_name}</span>
            )}
            {assignedByOther && task.creator && (
              <span className="rounded-full bg-sparrow-cream px-2 py-0.5 text-[11px] text-sparrow-ink">
                Assigned by {task.creator.full_name.split(' ')[0]}
              </span>
            )}
          </span>
        </span>
        <DeptTag d={task.department} />
        <PriorityChip p={task.priority} />
      </button>
    </li>
  );
}
