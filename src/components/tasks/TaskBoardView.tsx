import { useEffect, useRef, useState, type DragEvent } from 'react';
import { dueLabel } from '@/lib/tasks';
import type { TaskStatus, TaskWithPeople } from '@/lib/types';
import { PriorityChip } from '../PriorityChip';
import { DeptTag } from '../DeptTag';
import { LabelPill } from '../LabelPill';

const COLUMNS: { status: TaskStatus; defaultLabel: string }[] = [
  { status: 'todo',        defaultLabel: 'To do' },
  { status: 'in_progress', defaultLabel: 'In progress' },
  { status: 'done',        defaultLabel: 'Done' },
];

type ColTitles = Record<TaskStatus, string>;

function loadColTitles(userId: string): ColTitles {
  try {
    const raw = localStorage.getItem(`sparrow.boardCols.${userId}`);
    if (raw) return JSON.parse(raw) as ColTitles;
  } catch { /* ignore */ }
  return { todo: 'To do', in_progress: 'In progress', done: 'Done' };
}

interface Props {
  tasks: TaskWithPeople[];
  today: string;
  userId: string;
  showAssignee: boolean;
  delegatedIds: Set<string>;
  onOpen: (task: TaskWithPeople) => void;
  onMoveStatus: (taskId: string, status: TaskStatus) => void;
}

export function TaskBoardView({ tasks, today, userId, showAssignee, delegatedIds, onOpen, onMoveStatus }: Props) {
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const [colTitles, setColTitles] = useState<ColTitles>(() => loadColTitles(userId));
  const [editingCol, setEditingCol] = useState<TaskStatus | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editingCol && inputRef.current) inputRef.current.select(); }, [editingCol]);

  function startEdit(status: TaskStatus) {
    setEditValue(colTitles[status]);
    setEditingCol(status);
  }

  function commitEdit() {
    if (!editingCol) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      const next = { ...colTitles, [editingCol]: trimmed };
      setColTitles(next);
      localStorage.setItem(`sparrow.boardCols.${userId}`, JSON.stringify(next));
    }
    setEditingCol(null);
  }

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
        const isEditing = editingCol === col.status;
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
            <div className="flex items-center justify-between px-1 pb-2 pt-1">
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') setEditingCol(null);
                  }}
                  className="w-full bg-transparent text-xs font-semibold uppercase tracking-wide text-sparrow-gray outline-none border-b border-sparrow-green"
                />
              ) : (
                <button
                  onClick={() => startEdit(col.status)}
                  title="Click to rename column"
                  className="group flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-sparrow-gray hover:text-sparrow-ink"
                >
                  {colTitles[col.status]}
                  <span className="opacity-0 group-hover:opacity-40 text-[10px] not-uppercase normal-case tracking-normal">✎</span>
                </button>
              )}
              <span className="ml-2 shrink-0 text-xs text-sparrow-gray/70">· {items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => (
                <Card key={t.id} task={t} today={today} showAssignee={showAssignee} isDelegated={delegatedIds.has(t.id)} onOpen={() => onOpen(t)} />
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
  isDelegated,
  onOpen,
}: {
  task: TaskWithPeople;
  today: string;
  showAssignee: boolean;
  isDelegated: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      draggable={!isDelegated}
      onDragStart={isDelegated ? undefined : (e) => e.dataTransfer.setData('text/plain', task.id)}
      onClick={onOpen}
      className={`block w-full rounded-lg border border-sparrow-rule bg-white p-3 text-left shadow-card ${
        isDelegated ? 'cursor-pointer opacity-80' : 'cursor-grab active:cursor-grabbing'
      }`}
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
      {isDelegated && task.assignee && (
        <p className="mt-1 text-xs text-blue-500">→ {task.assignee.full_name.split(' ')[0]}</p>
      )}
      {!isDelegated && showAssignee && task.assignee && (
        <p className="mt-1 text-xs text-sparrow-gray">{task.assignee.full_name}</p>
      )}
    </button>
  );
}
