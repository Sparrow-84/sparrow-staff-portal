import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  DEPARTMENTS,
  PRIORITIES,
  type Department,
  type Priority,
  type Profile,
  type TaskComment,
  type TaskStatus,
  type TaskWithPeople,
} from '@/lib/types';
import {
  addComment,
  createTask,
  deleteTask,
  deleteFutureRecurringTasks,
  notifyTaskCommentMentions,
  updateTask,
  updateFutureRecurringTasks,
  type TaskInput,
} from '@/lib/data';
import { parseMentionIds } from '@/lib/chat';
import { MentionInput } from '@/components/chat/MentionInput';
import { LABEL_COLORS, LabelPill } from '@/components/LabelPill';

// ── Recurrence helpers ────────────────────────────────────────────────────────

function rLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rAddMonths(base: Date, n: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + n);
  return d;
}

function getNthDow(d: Date): { n: number; dow: number } {
  return { dow: d.getDay(), n: Math.ceil(d.getDate() / 7) };
}

const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NTH = ['', '1st', '2nd', '3rd', '4th', '5th'];

function monthlyDateLabel(startDate: string): string {
  if (!startDate) return 'Monthly on this date';
  const d = new Date(startDate + 'T12:00:00');
  return `Monthly on day ${d.getDate()}`;
}

function monthlyDowLabel(startDate: string): string {
  if (!startDate) return 'Monthly on this weekday';
  const d = new Date(startDate + 'T12:00:00');
  const { n, dow } = getNthDow(d);
  return `Monthly on the ${NTH[n] ?? `${n}th`} ${DOW_NAMES[dow]}`;
}

function generateTaskDates(
  startDate: string,
  freq: 'weekly' | 'biweekly' | 'monthly-date' | 'monthly-dow',
  daysOfWeek: number[],
  untilDate: string,
): string[] {
  if (!startDate || !untilDate || untilDate < startDate) return startDate ? [startDate] : [];
  const dates: string[] = [];

  if (freq === 'weekly' || freq === 'biweekly') {
    const step = freq === 'biweekly' ? 14 : 7;
    const start = new Date(startDate + 'T12:00:00');
    const activeDows = daysOfWeek.length > 0 ? daysOfWeek : [start.getDay()];
    for (const dow of activeDows) {
      const d = new Date(start);
      const diff = (dow - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + diff);
      while (rLocalISO(d) <= untilDate) {
        dates.push(rLocalISO(d));
        d.setDate(d.getDate() + step);
      }
    }
    return [...new Set(dates)].sort();
  }

  if (freq === 'monthly-date') {
    let cur = new Date(startDate + 'T12:00:00');
    while (rLocalISO(cur) <= untilDate) {
      dates.push(rLocalISO(cur));
      cur = rAddMonths(cur, 1);
    }
    return dates;
  }

  if (freq === 'monthly-dow') {
    const start = new Date(startDate + 'T12:00:00');
    const { n, dow } = getNthDow(start);
    for (let mo = 0; mo <= 120; mo++) {
      const ref = rAddMonths(start, mo);
      const target = new Date(ref.getFullYear(), ref.getMonth(), 1);
      let count = 0;
      while (target.getMonth() === ref.getMonth()) {
        if (target.getDay() === dow) {
          count++;
          if (count === n) break;
        }
        target.setDate(target.getDate() + 1);
      }
      if (rLocalISO(target) > untilDate) break;
      if (rLocalISO(target) >= startDate) dates.push(rLocalISO(target));
    }
    return dates;
  }

  return [startDate];
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  task: TaskWithPeople | null;
  profiles: Profile[];
  currentUser: Profile;
  comments: TaskComment[];
  today: string;
  readOnly?: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function TaskPanel({ open, task, profiles, currentUser, comments, today, readOnly = false, onClose, onChanged }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [department, setDepartment] = useState<Department>('ops');
  const [priority, setPriority] = useState<Priority>('p3');
  const [assigneeId, setAssigneeId] = useState(currentUser.id);
  // Multi-assignee selection for NEW tasks only — creates one independent task per
  // person so completing one doesn't affect anyone else's copy.
  const [assigneeIds, setAssigneeIds] = useState<string[]>([currentUser.id]);
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [label, setLabel] = useState('');
  const [labelColor, setLabelColor] = useState('blue');
  const [comment, setComment] = useState('');

  // Recurring task state — for new tasks, or converting an existing non-recurring
  // task into the start of a series.
  const [recurring, setRecurring] = useState(false);
  const [rFrequency, setRFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [rMonthlyMode, setRMonthlyMode] = useState<'date' | 'dow'>('date');
  const [rDaysOfWeek, setRDaysOfWeek] = useState<number[]>([]);
  const [rUntilDate, setRUntilDate] = useState('');

  // Delete confirmation for recurring tasks
  const [deleteChoice, setDeleteChoice] = useState(false);
  // Edit scope confirmation ("this task only" vs "this + future") for recurring tasks
  const [editChoice, setEditChoice] = useState(false);

  // Reset the form whenever the panel opens for a new/different task.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setComment('');
    setDeleteChoice(false);
    setEditChoice(false);
    setRecurring(false);
    setRFrequency('weekly');
    setRMonthlyMode('date');
    setRDaysOfWeek([]);
    setRUntilDate('');
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? '');
      setDueDate(task.due_date ?? '');
      setDepartment(task.department);
      setPriority(task.priority);
      setAssigneeId(task.assignee_id);
      setStatus(task.status);
      setLabel(task.label ?? '');
      setLabelColor(task.label_color ?? 'blue');
    } else {
      setTitle('');
      setNotes('');
      setDueDate('');
      setDepartment(currentUser.department);
      setPriority('p3');
      setAssigneeId(currentUser.id);
      setStatus('todo');
      setLabel('');
      setLabelColor('blue');
      setAssigneeIds([currentUser.id]);
    }
  }, [open, task, currentUser.id, currentUser.department]);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      }
      return [...prev, id];
    });
  }

  const tomorrow = (() => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  function handleToggleRecurring(checked: boolean) {
    setRecurring(checked);
    if (checked && dueDate && rDaysOfWeek.length === 0) {
      setRDaysOfWeek([new Date(dueDate + 'T12:00:00').getDay()]);
    }
  }

  function toggleDow(i: number) {
    setRDaysOfWeek((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]));
  }

  const effectiveFreq: 'weekly' | 'biweekly' | 'monthly-date' | 'monthly-dow' = useMemo(() => {
    if (rFrequency === 'monthly') return rMonthlyMode === 'dow' ? 'monthly-dow' : 'monthly-date';
    return rFrequency;
  }, [rFrequency, rMonthlyMode]);

  const occurrenceDates = useMemo((): string[] => {
    if (!recurring || !dueDate) return [];
    const effectiveDows =
      rDaysOfWeek.length > 0 ? rDaysOfWeek : [new Date(dueDate + 'T12:00:00').getDay()];
    return generateTaskDates(dueDate, effectiveFreq, effectiveDows, rUntilDate);
  }, [recurring, dueDate, effectiveFreq, rDaysOfWeek, rUntilDate]);

  // When converting an existing task into a series, it keeps its own date —
  // only later dates in the pattern become new rows.
  const futureOccurrenceDates = useMemo(
    () => (task ? occurrenceDates.filter((d) => d > (dueDate || '')) : []),
    [task, occurrenceDates, dueDate],
  );

  function save() {
    if (!title.trim()) {
      setError('A title is required.');
      return;
    }
    if (recurring && !task?.recurrence_id && (!dueDate || !rUntilDate)) {
      setError('Recurring tasks need a due date and a "Repeat until" date — fill both in, or uncheck "Repeat this task."');
      return;
    }
    if (task?.recurrence_id && !editChoice) {
      setEditChoice(true);
      return;
    }
    doSave('single');
  }

  function doSave(scope: 'single' | 'future') {
    const base: TaskInput = {
      title: title.trim(),
      notes: notes.trim() || null,
      due_date: dueDate || null,
      department,
      priority,
      assignee_id: assigneeId,
      status,
      label: label.trim() || null,
      label_color: label.trim() ? labelColor : null,
    };
    startTransition(async () => {
      try {
        if (task && task.recurrence_id && scope === 'future') {
          const deltaDays =
            dueDate && task.due_date && dueDate !== task.due_date
              ? Math.round(
                  (new Date(`${dueDate}T12:00:00`).getTime() - new Date(`${task.due_date}T12:00:00`).getTime()) /
                    86_400_000,
                )
              : 0;
          const { due_date: _dd, status: _st, ...fieldsOnly } = base;
          await updateFutureRecurringTasks(task.recurrence_id, task.due_date!, fieldsOnly, deltaDays || undefined);
          await updateTask(task.id, base);
        } else if (task && !task.recurrence_id && recurring && futureOccurrenceDates.length > 0) {
          // Converting an existing task into the start of a new recurring series:
          // this task keeps its own date; only the dates after it become new rows.
          const rid = crypto.randomUUID();
          await updateTask(task.id, { ...base, recurrence_id: rid });
          await Promise.all(
            futureOccurrenceDates.map((d) => createTask({ ...base, due_date: d, recurrence_id: rid }, currentUser.id)),
          );
        } else if (task) {
          await updateTask(task.id, base);
        } else if (recurring && occurrenceDates.length > 1) {
          // One independent recurring series per selected assignee.
          await Promise.all(
            assigneeIds.flatMap((aid) => {
              const rid = crypto.randomUUID();
              return occurrenceDates.map((d) =>
                createTask({ ...base, assignee_id: aid, due_date: d, recurrence_id: rid }, currentUser.id),
              );
            }),
          );
        } else {
          // One independent task per selected assignee.
          await Promise.all(assigneeIds.map((aid) => createTask({ ...base, assignee_id: aid }, currentUser.id)));
        }
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  function remove() {
    if (!task) return;
    if (task.recurrence_id && !deleteChoice) {
      setDeleteChoice(true);
      return;
    }
    startTransition(async () => {
      try {
        await deleteTask(task.id);
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete.');
      }
    });
  }

  function removeFuture() {
    if (!task?.recurrence_id || !task.due_date) return;
    startTransition(async () => {
      try {
        await deleteFutureRecurringTasks(task.recurrence_id!, task.due_date!);
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete.');
      }
    });
  }

  function postComment() {
    if (!task || !comment.trim()) return;
    const body = comment.trim();
    startTransition(async () => {
      try {
        await addComment(task.id, body, currentUser.id);
        const mentioned = parseMentionIds(body, profiles);
        if (mentioned.length > 0) {
          void notifyTaskCommentMentions(mentioned, currentUser.id, task.id, body).catch(() => {});
        }
        setComment('');
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not comment.');
      }
    });
  }

  const nameById = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? 'Someone';

  const newTaskCount = (recurring && occurrenceDates.length > 1 ? occurrenceDates.length : 1) * assigneeIds.length;
  const saveLabel = pending
    ? 'Saving…'
    : task
      ? !task.recurrence_id && recurring && futureOccurrenceDates.length > 0
        ? `Save + create ${futureOccurrenceDates.length} more`
        : 'Save'
      : newTaskCount > 1
        ? `Create ${newTaskCount} tasks`
        : 'Create task';

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-sparrow-ink/30 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-sparrow-rule px-5 py-4">
          <h2 className="font-serif text-lg font-semibold">
            {task ? (readOnly ? 'View task' : 'Edit task') : 'New task'}
          </h2>
          <button onClick={onClose} className="btn-ghost" aria-label="Close">
            ✕
          </button>
        </div>

        {readOnly && (
          <div className="border-b border-sparrow-rule bg-sparrow-cream px-5 py-3">
            <p className="text-sm text-sparrow-gray">
              You assigned this task — you can comment below but can't edit it.
            </p>
          </div>
        )}

        {!readOnly && task && task.created_by === currentUser.id && task.assignee_id !== currentUser.id && (
          <div className="border-b border-sparrow-rule bg-sparrow-cream px-5 py-3">
            <p className="text-sm text-sparrow-gray">
              You assigned this to {task.assignee?.full_name ?? 'someone else'} — they'll be notified if you edit it.
            </p>
          </div>
        )}

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label className="field-label" htmlFor="t-title">
            Task
          </label>
          <input
            id="t-title"
            className="field-input text-base disabled:opacity-60"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            disabled={readOnly}
            autoFocus
          />

          <div className="mt-4">
            <label className="field-label" htmlFor="t-notes">
              Notes
            </label>
            <textarea
              id="t-notes"
              className="field-input disabled:opacity-60"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={readOnly}
            />
          </div>

          <div className="mt-4">
            <label className="field-label">Due date</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="date"
                className="field-input !mt-0 flex-1 disabled:opacity-60"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={readOnly}
              />
              {!readOnly && (
                <>
                  <button type="button" className="btn-ghost" onClick={() => setDueDate(today)}>
                    Today
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setDueDate(tomorrow)}>
                    Tomorrow
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="t-dept">
                Department
              </label>
              <select
                id="t-dept"
                className="field-input disabled:opacity-60"
                value={department}
                onChange={(e) => setDepartment(e.target.value as Department)}
                disabled={readOnly}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="t-priority">
                Priority
              </label>
              <select
                id="t-priority"
                className="field-input disabled:opacity-60"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                disabled={readOnly}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!task && (
            <div className="mt-4">
              <label className="field-label">
                Assign to <span className="font-normal text-sparrow-gray">(pick one or more — each person gets their own copy)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {profiles.map((p) => {
                  const active = assigneeIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleAssignee(p.id)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                        active
                          ? 'border-sparrow-green bg-sparrow-green text-white'
                          : 'border-sparrow-rule bg-white text-sparrow-gray hover:text-sparrow-ink'
                      }`}
                    >
                      {p.id === currentUser.id ? 'Me' : p.full_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={`mt-4 ${task ? 'grid grid-cols-2 gap-3' : ''}`}>
            {task && (
              <div>
                <label className="field-label" htmlFor="t-assignee">
                  Assignee
                </label>
                <select
                  id="t-assignee"
                  className="field-input disabled:opacity-60"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  disabled={readOnly}
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === currentUser.id ? 'Me' : p.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="field-label" htmlFor="t-status">
                Status
              </label>
              <select
                id="t-status"
                className="field-input disabled:opacity-60"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                disabled={readOnly}
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          {/* Label */}
          <div className="mt-4">
            <label className="field-label">
              Label <span className="font-normal text-sparrow-gray">(optional)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="field-input !mt-0 flex-1 disabled:opacity-60"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Personal, Client work…"
                disabled={readOnly}
              />
              {label && (
                <button
                  type="button"
                  onClick={() => {
                    setLabel('');
                    setLabelColor('blue');
                  }}
                  className="shrink-0 text-xs text-sparrow-gray hover:text-sparrow-ink"
                  aria-label="Clear label"
                >
                  ✕
                </button>
              )}
            </div>
            {label && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[11px] text-sparrow-gray">Color:</span>
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setLabelColor(c.id)}
                    aria-label={c.id}
                    className={`h-5 w-5 shrink-0 rounded-full ${c.swatch} transition ${
                      labelColor === c.id ? 'ring-2 ring-sparrow-ink ring-offset-1' : 'opacity-60 hover:opacity-100'
                    }`}
                  />
                ))}
                <span className="ml-1">
                  <LabelPill label={label} color={labelColor} />
                </span>
              </div>
            )}
          </div>

          {/* Recurring badge for existing tasks already in a series */}
          {task?.recurrence_id && (
            <div className="mt-3 rounded-lg bg-sparrow-cream px-3 py-2 text-xs text-sparrow-ink">
              Part of a recurring series — Save will ask whether to apply your changes to just this task or to it and every later one too.
            </div>
          )}

          {/* Recurring setup — new tasks, or turning an existing task into the start of a series */}
          {!task?.recurrence_id && (
            <div className="mt-4 border-t border-sparrow-rule pt-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => handleToggleRecurring(e.target.checked)}
                  className="h-4 w-4 accent-sparrow-green"
                />
                <span className="text-sm font-medium text-sparrow-ink">Repeat this task</span>
              </label>

              {recurring && (
                <div className="mt-3 space-y-3">
                  {/* Frequency */}
                  <div>
                    <span className="field-label block mb-1">Repeats</span>
                    <div className="flex gap-2">
                      {(['weekly', 'biweekly', 'monthly'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setRFrequency(f)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            rFrequency === f
                              ? 'border-sparrow-green bg-sparrow-green text-white'
                              : 'border-sparrow-rule bg-white text-sparrow-gray hover:text-sparrow-ink'
                          }`}
                        >
                          {f === 'weekly' ? 'Weekly' : f === 'biweekly' ? 'Every 2 weeks' : 'Monthly'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* DOW grid for weekly / biweekly */}
                  {(rFrequency === 'weekly' || rFrequency === 'biweekly') && (
                    <div>
                      <span className="field-label block mb-1">On</span>
                      <div className="flex gap-1">
                        {DOW_LABELS.map((dl, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => toggleDow(i)}
                            className={`h-8 w-9 rounded-lg border text-xs font-medium transition ${
                              rDaysOfWeek.includes(i)
                                ? 'border-sparrow-green bg-sparrow-green text-white'
                                : 'border-sparrow-rule bg-white text-sparrow-gray hover:text-sparrow-ink'
                            }`}
                          >
                            {dl}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Monthly mode radio */}
                  {rFrequency === 'monthly' && (
                    <div className="space-y-1.5">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="rMonthlyMode"
                          checked={rMonthlyMode === 'date'}
                          onChange={() => setRMonthlyMode('date')}
                          className="accent-sparrow-green"
                        />
                        {monthlyDateLabel(dueDate)}
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="rMonthlyMode"
                          checked={rMonthlyMode === 'dow'}
                          onChange={() => setRMonthlyMode('dow')}
                          className="accent-sparrow-green"
                        />
                        {monthlyDowLabel(dueDate)}
                      </label>
                    </div>
                  )}

                  {/* Until date */}
                  <div>
                    <label className="field-label" htmlFor="r-until">
                      Repeat until <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="r-until"
                      type="date"
                      className="field-input"
                      value={rUntilDate}
                      onChange={(e) => setRUntilDate(e.target.value)}
                      required
                    />
                  </div>

                  {/* Occurrence count preview */}
                  <p className="text-xs text-sparrow-gray">
                    {!rUntilDate
                      ? 'Required — this task will only save as recurring once you set an end date.'
                      : occurrenceDates.length === 0
                        ? 'No dates match — check your settings.'
                        : occurrenceDates.length === 1
                          ? '1 task will be created'
                          : `${occurrenceDates.length} tasks will be created`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Comments (existing tasks only) */}
          {task && (
            <div className="mt-6 border-t border-sparrow-rule pt-4">
              <p className="field-label">Comments</p>
              <ul className="mt-2 space-y-3">
                {comments.length === 0 && <li className="text-sm text-sparrow-gray">No comments yet.</li>}
                {comments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <span className="font-medium text-sparrow-ink">{nameById(c.author_id)}</span>
                    <span className="ml-2 text-xs text-sparrow-gray">
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                    <p className="text-sparrow-ink">{c.body}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-end gap-2">
                <MentionInput
                  value={comment}
                  onChange={setComment}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) postComment();
                  }}
                  staff={profiles}
                  disabled={pending}
                  placeholder="Add a comment… (@ to mention)"
                  className="field-input mt-0 max-h-24 w-full resize-none"
                />
                <button onClick={postComment} disabled={pending || !comment.trim()} className="btn-ghost">
                  Post
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-sparrow-rule px-5 py-4">
          {readOnly || editChoice ? (
            <span />
          ) : task ? (
            deleteChoice ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-sparrow-gray">Delete recurring task:</span>
                <div className="flex gap-2">
                  <button
                    onClick={remove}
                    disabled={pending}
                    className="btn-ghost text-xs text-priority-p1"
                  >
                    This task only
                  </button>
                  <button
                    onClick={removeFuture}
                    disabled={pending}
                    className="btn-ghost text-xs text-priority-p1"
                  >
                    This + future
                  </button>
                  <button
                    onClick={() => setDeleteChoice(false)}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={remove} disabled={pending} className="btn-ghost text-priority-p1">
                Delete
              </button>
            )
          ) : (
            <span />
          )}
          {readOnly ? (
            <button onClick={onClose} className="btn-primary">
              Close
            </button>
          ) : editChoice ? (
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-xs text-sparrow-gray">Apply this edit to:</span>
              <div className="flex gap-2">
                <button onClick={() => setEditChoice(false)} className="btn-ghost text-xs">
                  Cancel
                </button>
                <button onClick={() => doSave('single')} disabled={pending} className="btn-ghost text-xs">
                  This task only
                </button>
                <button onClick={() => doSave('future')} disabled={pending} className="btn-primary text-xs">
                  This + future
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost">
                Cancel
              </button>
              <button onClick={save} disabled={pending} className="btn-primary">
                {saveLabel}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
