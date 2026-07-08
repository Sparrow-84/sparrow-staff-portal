import { useState, type DragEvent } from 'react';
import { dueLabel } from '@/lib/tasks';
import type { TaskStatus, TaskWithPeople } from '@/lib/types';
import { PriorityChip } from '../PriorityChip';
import { DeptTag } from '../DeptTag';
import { LabelPill } from '../LabelPill';

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To do' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'done', label: 'Done' },
];

interface Props {
  tasks: TaskWithPeople[];
  today: string;
  showAssignee: boolean;
  onOpen: (task: TaskWithPeople) => void;
  onMoveStatus: (taskId: string, status: TaskStatus) => void;
}

export function TaskBoardView({ tasks, today, showAssignee, onOpen, onMoveStatus }: Props) {
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  function onDrop(e: DragEvent, status: TaskStatus) {
    e.preventDefault();
    setOverCol(null);
    const id = e.dataTransfer.getData('text/plain');
    if (id) onMoveStatus(id, status);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = tasks.filter((t) => t.status === col.status);
        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.status);
            }}
            onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
            onDrop={(e) => onDrop(e, col.status)}
            className={`rounded-xl border p-2 transition ${
              overCol === col.status
                ? 'border-sparrow-green bg-sparrow-sage'
                : 'border-sparrow-rule bg-sparrow-mist'
            }`}
          >
            <h2 className="px-1 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              {col.label} <span className="text-sparrow-gray/70">· {items.length}</span>
            </h2>
            <div className="space-y-2">
              {items.map((t) => (
                <Card key={t.id} task={t} today={today} showAssignee={showAssignee} onOpen={() => onOpen(t)} />
              ))}
              {items.length === 0 && (
                <p className="px-1 py-6 text-center text-xs text-sparrow-gray/70">Drop tasks here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({
  task,
  today,
  showAssignee,
  onOpen,
}: {
  task: TaskWithPeople;
  today: string;
  showAssignee: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
      onClick={onOpen}
      className="block w-full cursor-grab rounded-lg border border-sparrow-rule bg-white p-3 text-left shadow-card active:cursor-grabbing"
    >
      {task.label && task.label_color && (
        <div className="mb-1.5">
          <LabelPill label={task.label} color={task.label_color} />
        </div>
      )}
      <p className="text-sm text-sparrow-ink">{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PriorityChip p={task.priority} />
        <DeptTag d={task.department} />
        {task.due_date && (
          <span className="text-xs text-sparrow-gray">{dueLabel(task.due_date, today)}</span>
        )}
      </div>
      {showAssignee && task.assignee && (
        <p className="mt-1 text-xs text-sparrow-gray">{task.assignee.full_name}</p>
      )}
    </button>
  );
}
