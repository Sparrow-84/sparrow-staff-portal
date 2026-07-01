import { useMemo, useState, type DragEvent } from 'react';
import { isoDate, PRIORITY_META, TIER_META, tierForPriority } from '@/lib/tasks';
import type { TaskStatus, TaskWithPeople } from '@/lib/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

function monthMatrix(cursor: Date): Date[][] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const d = new Date(year, month, 1 - first.getDay()); // back to the Sunday on/before the 1st
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

interface Props {
  tasks: TaskWithPeople[];
  today: string;
  onOpen: (task: TaskWithPeople) => void;
  onMoveDate: (taskId: string, dateIso: string) => void;
}

interface TooltipState {
  task: TaskWithPeople;
  x: number;
  y: number;
}

function TaskTooltip({ task, x, y }: TooltipState) {
  const tier = TIER_META[tierForPriority(task.priority)];
  const left = x > window.innerWidth - 290 ? x - 274 : x + 14;
  const top = y + 16;

  return (
    <div
      className="pointer-events-none fixed z-50 w-64 rounded-lg border border-sparrow-rule bg-white p-3 shadow-lg"
      style={{ left, top }}
    >
      <p className="text-sm font-medium leading-snug text-sparrow-ink">{task.title}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${tier.dot}`} aria-hidden />
        <span className={`text-xs font-medium ${tier.text}`}>{tier.label}</span>
      </div>
      <p className="mt-1 text-xs text-sparrow-gray">{STATUS_LABELS[task.status]}</p>
      {task.assignee && (
        <p className="mt-1 text-xs text-sparrow-gray">{task.assignee.full_name}</p>
      )}
      {task.notes && (
        <p className="mt-2 line-clamp-3 text-xs text-sparrow-ink/70">{task.notes}</p>
      )}
    </div>
  );
}

export function TaskCalendarView({ tasks, today, onOpen, onMoveDate }: Props) {
  const [y, m] = today.split('-').map(Number);
  const [cursor, setCursor] = useState(new Date(y, m - 1, 1));
  const [overDate, setOverDate] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const weeks = useMemo(() => monthMatrix(cursor), [cursor]);
  const byDate = useMemo(() => {
    const map = new Map<string, TaskWithPeople[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const arr = map.get(t.due_date) ?? [];
      arr.push(t);
      map.set(t.due_date, arr);
    }
    return map;
  }, [tasks]);

  const undated = useMemo(() => tasks.filter((t) => !t.due_date), [tasks]);

  function onDrop(e: DragEvent, iso: string) {
    e.preventDefault();
    setOverDate(null);
    const id = e.dataTransfer.getData('text/plain');
    if (id) onMoveDate(id, iso);
  }

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div>
      {/* Month nav */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold">{monthLabel}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="btn-ghost"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button onClick={() => setCursor(new Date(y, m - 1, 1))} className="btn-ghost text-xs">
            Today
          </button>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="btn-ghost"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-sparrow-rule pb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 text-center text-xs font-medium text-sparrow-gray">
            {w}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid grid-cols-7 overflow-hidden rounded-b-xl border-x border-b border-sparrow-rule">
        {weeks.flat().map((day) => {
          const iso = isoDate(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = iso === today;
          const items = byDate.get(iso) ?? [];
          return (
            <div
              key={iso}
              onDragOver={(e) => {
                e.preventDefault();
                setOverDate(iso);
              }}
              onDragLeave={() => setOverDate((d) => (d === iso ? null : d))}
              onDrop={(e) => onDrop(e, iso)}
              className={`min-h-24 border-b border-r border-sparrow-rule p-1 align-top ${
                inMonth ? 'bg-white' : 'bg-sparrow-mist/50'
              } ${overDate === iso ? 'ring-2 ring-inset ring-sparrow-gold' : ''}`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    isToday
                      ? 'bg-sparrow-green font-semibold text-white'
                      : inMonth
                        ? 'text-sparrow-ink'
                        : 'text-sparrow-gray/60'
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {items.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id);
                      setTooltip(null);
                    }}
                    onMouseEnter={(e) => setTooltip({ task: t, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => onOpen(t)}
                    className={`block w-full cursor-grab truncate rounded px-1.5 py-0.5 text-left text-[11px] active:cursor-grabbing ${PRIORITY_META[t.priority].pill} ${
                      t.status === 'done' ? 'opacity-50 line-through' : ''
                    }`}
                  >
                    {t.title}
                  </button>
                ))}
                {items.length > 3 && (
                  <p className="px-1 text-[11px] text-sparrow-gray">+{items.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Undated tasks — draggable onto a day to schedule */}
      {undated.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
            No date · {undated.length} <span className="font-normal normal-case">(drag onto a day to schedule)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {undated.map((t) => (
              <button
                key={t.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', t.id);
                  setTooltip(null);
                }}
                onMouseEnter={(e) => setTooltip({ task: t, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onOpen(t)}
                className={`cursor-grab truncate rounded px-2 py-1 text-xs active:cursor-grabbing ${PRIORITY_META[t.priority].pill}`}
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {tooltip && <TaskTooltip {...tooltip} />}
    </div>
  );
}
