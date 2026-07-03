import { useEffect, useState } from 'react';
import { ADD_KINDS, createCalendarEvents, withTzOffset, type CalendarKind } from '@/lib/calendar';
import { Drawer } from '@/components/lcp/Drawer';
import type { Department } from '@/lib/types';
import { DEPARTMENTS } from '@/lib/types';

const DOW_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return localISO(d);
}


function generateDates(
  startDate: string,
  frequency: 'weekly' | 'biweekly',
  daysOfWeek: number[],
  untilDate: string,
): string[] {
  if (daysOfWeek.length === 0) return [];
  const dates: string[] = [];
  const start = new Date(startDate + 'T12:00:00');
  const until = new Date(untilDate + 'T12:00:00');
  if (until < start) return [];

  const cursor = new Date(start);
  cursor.setDate(start.getDate() - start.getDay());
  const step = frequency === 'weekly' ? 7 : 14;

  while (cursor <= until) {
    for (const dow of [...daysOfWeek].sort((a, b) => a - b)) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + dow);
      if (d >= start && d <= until) dates.push(localISO(d));
    }
    cursor.setDate(cursor.getDate() + step);
    if (dates.length > 300) break;
  }
  return dates;
}

interface Props {
  open: boolean;
  defaultDate: string;
  currentUserId: string;
  userDepts: Department[];
  initialDept: Department | null;
  onClose: () => void;
  onCreated: () => void;
}

export function AddOrgEventPanel({ open, defaultDate, currentUserId, userDepts, initialDept, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CalendarKind>('other');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [department, setDepartment] = useState<Department | null>(initialDept);

  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly'>('weekly');
  const [daysOfWeek, setDaysOfWeek] = useState<Set<number>>(() => new Set([new Date().getDay()]));
  const [untilMode, setUntilMode] = useState<'date' | 'indefinite'>('date');
  const [untilDate, setUntilDate] = useState(() => addMonths(localISO(new Date()), 3));

  const [isPersonal, setIsPersonal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setDate(defaultDate); }, [defaultDate]);
  useEffect(() => { setDepartment(initialDept); }, [initialDept]);

  function toggleDay(dow: number) {
    setDaysOfWeek((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) { if (next.size > 1) next.delete(dow); }
      else next.add(dow);
      return next;
    });
  }

  const effectiveUntil = untilMode === 'indefinite' ? addMonths(date, 12) : untilDate;
  const occurrenceDates = recurring
    ? generateDates(date, frequency, [...daysOfWeek], effectiveUntil)
    : [date];

  const canSubmit = title.trim() && date && (allDay || startTime) && occurrenceDates.length > 0;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const recurrenceId = recurring && occurrenceDates.length > 1 ? crypto.randomUUID() : null;

      const inputs = occurrenceDates.map((d) => ({
        kind,
        title: title.trim(),
        starts_at: allDay ? `${d}T00:00:00+00:00` : withTzOffset(d, startTime),
        ends_at: !allDay && endTime ? withTzOffset(d, endTime) : null,
        all_day: allDay,
        location: location.trim() || null,
        recurrence_id: recurrenceId,
        created_by: currentUserId,
        department: isPersonal ? null : department,
        is_personal: isPersonal,
      }));

      await createCalendarEvents(inputs);
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setTitle('');
    setKind('other');
    setDate(defaultDate);
    setStartTime('09:00');
    setEndTime('');
    setLocation('');
    setAllDay(false);
    setRecurring(false);
    setFrequency('weekly');
    setDaysOfWeek(new Set([new Date().getDay()]));
    setUntilMode('date');
    setUntilDate(addMonths(localISO(new Date()), 3));
    setDepartment(initialDept);
    setIsPersonal(false);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const submitLabel = saving
    ? 'Saving…'
    : occurrenceDates.length === 1
      ? 'Add event'
      : `Add ${occurrenceDates.length} events`;

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Add Event"
      footer={
        <div className="space-y-2">
          {error && <p className="text-sm text-priority-p1">{error}</p>}
          <button
            onClick={submit}
            disabled={!canSubmit || saving}
            className="btn-primary w-full"
          >
            {submitLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="field-label">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Community BBQ"
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label">Type</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as CalendarKind)} className="field-input">
            {ADD_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">Post to</label>
          <select
            value={isPersonal ? '__personal__' : (department ?? '')}
            onChange={(e) => {
              if (e.target.value === '__personal__') {
                setIsPersonal(true);
                setDepartment(null);
              } else {
                setIsPersonal(false);
                setDepartment(e.target.value ? e.target.value as Department : null);
              }
            }}
            className="field-input"
          >
            <option value="">All Staff</option>
            {userDepts.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENTS.find((x) => x.value === d)?.label ?? d}
              </option>
            ))}
            <option value="__personal__">Personal (only me)</option>
          </select>
          {isPersonal && (
            <p className="mt-1 text-xs text-sparrow-gray">Only visible to you — no other staff can see this event.</p>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-sparrow-ink">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
          />
          All day
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="field-label">{recurring ? 'Start date' : 'Date'}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="field-input"
            />
          </div>
          {!allDay && (
            <>
              <div>
                <label className="field-label">Start time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">
                  End time <span className="font-normal text-sparrow-gray">(optional)</span>
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="field-input"
                />
              </div>
            </>
          )}
        </div>

        <div>
          <label className="field-label">
            Location <span className="font-normal text-sparrow-gray">(optional)</span>
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Twin Oaks Park"
            className="field-input"
          />
        </div>

        {/* Recurrence */}
        <div className="border-t border-sparrow-rule pt-4">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-sparrow-ink">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
            />
            Repeat this event
          </label>

          {recurring && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="field-label">Frequency</label>
                <div className="mt-1 flex gap-2">
                  {(['weekly', 'biweekly'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFrequency(f)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        frequency === f
                          ? 'bg-sparrow-green text-white'
                          : 'bg-sparrow-mist text-sparrow-gray hover:text-sparrow-ink'
                      }`}
                    >
                      {f === 'weekly' ? 'Weekly' : 'Every 2 weeks'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="field-label">On these days</label>
                <div className="mt-1 flex gap-1.5">
                  {DOW_ABBR.map((abbr, dow) => (
                    <button
                      key={dow}
                      type="button"
                      onClick={() => toggleDay(dow)}
                      className={`h-8 w-8 rounded-full text-xs font-semibold transition ${
                        daysOfWeek.has(dow)
                          ? 'bg-sparrow-green text-white'
                          : 'bg-sparrow-mist text-sparrow-gray hover:text-sparrow-ink'
                      }`}
                    >
                      {abbr}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="field-label">Repeat until</label>
                <div className="mt-1 flex gap-2">
                  {(['date', 'indefinite'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setUntilMode(m)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        untilMode === m
                          ? 'bg-sparrow-green text-white'
                          : 'bg-sparrow-mist text-sparrow-gray hover:text-sparrow-ink'
                      }`}
                    >
                      {m === 'date' ? 'On a date' : 'Indefinitely'}
                    </button>
                  ))}
                </div>
                {untilMode === 'date' && (
                  <input
                    type="date"
                    value={untilDate}
                    min={date}
                    onChange={(e) => setUntilDate(e.target.value)}
                    className="field-input mt-2"
                  />
                )}
              </div>

              <p className="text-sm text-sparrow-gray">
                {occurrenceDates.length === 0
                  ? 'No dates match — check your day selection and date range.'
                  : `This will create ${occurrenceDates.length} event${occurrenceDates.length !== 1 ? 's' : ''}.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
