import { useMemo, useState, type DragEvent } from 'react';
import { isoDate, PRIORITY_META } from '@/lib/tasks';
import type { TaskWithPeople } from '@/lib/types';
import { LabelPill } from '../LabelPill';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekStart(today: string, offsetWeeks: number): Date {
  const d = new Date(today + 'T12:00:00');
  d.setDate(d.getDate() - d.getDay() + offsetWeeks * 7);
  return d;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function weekRangeLabel(days: Date[]): string {
  const s = days[0];
  const e = days[6];
  const sMonth = s.toLocaleDateString(undefined, { month: 'long' });
  const eMonth = e.toLocaleDateString(undefined, { month: 'long' });
  if (sMonth === eMonth) {
    return `${sMonth} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}, ${e.getFullYear()}`;
}

interface Props {
  tasks: TaskWithPeople[];
  today: string;
  delegatedIds: Set<string>;
  onOpen: (task: TaskWithPeople) => void;
  onMoveDate: (taskId: string, dateIso: string | null) => void;
  onToggle: (task: TaskWithPeople) => void;
}

export function TaskPlannerView({ tasks, today, delegatedIds, onOpen, onMoveDate, onToggle }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [overDate, setOverDate] = useState<string | null>(null);
  const [overUndated, setOverUndated] = useState(false);

  const weekStart = useMemo(() => getWeekStart(today, weekOffset), [today, weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

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

  return (
    <div>
      {/* Week nav */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold">{weekRangeLabel(days)}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => setWeekOffset((n) => n - 1)}
            className="btn-ghost"
            aria-label="Previous week"
          >
            ‹
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="btn-ghost text-xs">
              This week
            </button>
          )}
          <button
            onClick={() => setWeekOffset((n) => n + 1)}
            className="btn-ghost"
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

      {/* 7-column day grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const iso = isoDate(day);
          const isToday = iso === today;
          const isPast = iso < today;
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
              className={`flex flex-col rounded-xl border transition ${
                overDate === iso
                  ? 'border-sparrow-gold bg-amber-50'
                  : isToday
                    ? 'border-sparrow-green bg-sparrow-sage/20'
                    : 'border-sparrow-rule bg-white'
              }`}
            >
              {/* Day header */}
              <div className="border-b border-sparrow-rule px-2 py-1.5 text-center">
                <div
                  className={`text-[10px] font-semibold uppercase tracking-widest ${
                    isToday
                      ? 'text-sparrow-green'
                      : isPast
                        ? 'text-sparrow-gray/50'
                        : 'text-sparrow-gray'
                  }`}
                >
                  {WEEKDAYS[day.getDay()]}
                </div>
                <div
                  className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium ${
                    isToday
                      ? 'bg-sparrow-green text-white'
                      : isPast
                        ? 'text-sparrow-gray/40'
                        : 'text-sparrow-ink'
                  }`}
                >
                  {day.getDate()}
                </div>
              </div>

              {/* Tasks */}
              <div className="flex flex-1 flex-col gap-1 p-1.5" style={{ minHeight: '5rem' }}>
                {items.map((t) => (
                  <PlannerTask
                    key={t.id}
                    task={t}
                    isDelegated={delegatedIds.has(t.id)}
                    onOpen={() => onOpen(t)}
                    onToggle={() => onToggle(t)}
                  />
                ))}
                {items.length === 0 && (
                  <div className="flex flex-1 items-center justify-center">
                    <span className="text-[10px] text-sparrow-gray/30">drop here</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Undated tray — always visible; drop here to clear a due date */}
      <div
        className={`mt-4 rounded-xl border-2 border-dashed p-3 transition ${
          overUndated ? 'border-sparrow-gold bg-amber-50' : 'border-sparrow-rule'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setOverUndated(true);
        }}
        onDragLeave={() => setOverUndated(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOverUndated(false);
          const id = e.dataTransfer.getData('text/plain');
          if (id) onMoveDate(id, null);
        }}
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
          Unscheduled{undated.length > 0 ? ` · ${undated.length}` : ''}{' '}
          <span className="font-normal normal-case">— drag here to clear due date</span>
        </p>
        {undated.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {undated.map((t) => (
              <button
                key={t.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                onClick={() => onOpen(t)}
                className={`cursor-grab truncate rounded px-2 py-1 text-xs active:cursor-grabbing ${PRIORITY_META[t.priority].pill}`}
              >
                {t.title}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-sparrow-gray/50">No unscheduled tasks</p>
        )}
      </div>
    </div>
  );
}

function PlannerTask({
  task,
  isDelegated,
  onOpen,
  onToggle,
}: {
  task: TaskWithPeople;
  isDelegated: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const done = task.status === 'done';
  return (
    <div
      draggable={!isDelegated}
      onDragStart={isDelegated ? undefined : (e) => e.dataTransfer.setData('text/plain', task.id)}
      className={`rounded-lg border border-sparrow-rule bg-white px-2 py-1.5 transition-opacity ${
        isDelegated ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${done ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        {isDelegated ? (
          <span className="mt-0.5 shrink-0 text-[10px] leading-none text-blue-400">→</span>
        ) : (
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-sparrow-green"
          />
        )}
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          {task.label && task.label_color && (
            <div className="mb-0.5">
              <LabelPill label={task.label} color={task.label_color} />
            </div>
          )}
          <p
            className={`line-clamp-2 text-[11px] leading-snug ${
              done ? 'text-sparrow-gray line-through' : 'text-sparrow-ink'
            }`}
          >
            {task.title}
          </p>
        </button>
      </div>
    </div>
  );
}
