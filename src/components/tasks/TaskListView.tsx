import { useMemo, useState, type DragEvent } from 'react';
import { dueLabel, weekListGroups } from '@/lib/tasks';
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
  onMoveDate: (taskId: string, dateIso: string | null) => void;
}

// A group's key is a real ISO date (droppable to reschedule) unless it's one
// of these two overflow buckets, which aren't days you can drag a task onto.
function isDateKey(key: string): boolean {
  return key !== 'overdue' && key !== 'no_date';
}

export function TaskListView({ tasks, today, currentUserId, showAssignee, onToggle, onOpen, onMoveDate }: Props) {
  const groups = useMemo(() => weekListGroups(tasks, today), [tasks, today]);
  const [overKey, setOverKey] = useState<string | null>(null);

  if (tasks.length === 0) return <EmptyState />;

  function onDrop(e: DragEvent, key: string) {
    e.preventDefault();
    setOverKey(null);
    if (!isDateKey(key)) return;
    const id = e.dataTransfer.getData('text/plain');
    if (id) onMoveDate(id, key);
  }

  return (
    <div className="space-y-8">
      {groups.map(({ key, label, items }) => (
        <section
          key={key}
          onDragOver={isDateKey(key) ? (e) => { e.preventDefault(); setOverKey(key); } : undefined}
          onDragLeave={isDateKey(key) ? () => setOverKey((k) => (k === key ? null : k)) : undefined}
          onDrop={isDateKey(key) ? (e) => onDrop(e, key) : undefined}
        >
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
            {label} <span className="text-sparrow-gray/70">· {items.length}</span>
          </h2>
          <ul
            className={`divide-y divide-sparrow-rule overflow-hidden rounded-xl border bg-white transition ${
              overKey === key ? 'border-sparrow-gold bg-amber-50' : 'border-sparrow-rule'
            }`}
          >
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
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-sparrow-gray/70">Drop a task here</li>
            )}
          </ul>
        </section>
      ))}
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
    <li
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
      className="flex cursor-grab items-center gap-3 px-4 py-3 hover:bg-sparrow-mist active:cursor-grabbing"
    >
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
