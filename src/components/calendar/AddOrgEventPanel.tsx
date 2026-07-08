import { useEffect, useRef, useState } from 'react';
import { ADD_KINDS, addEventAttendees, createCalendarEvents, withTzOffset, type CalendarKind } from '@/lib/calendar';
import { Drawer } from '@/components/lcp/Drawer';
import type { Department, Profile } from '@/lib/types';
import { DEPARTMENTS } from '@/lib/types';

const DOW_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth'];

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return localISO(d);
}

/** Weekly / biweekly occurrence dates. */
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

/** Monthly by calendar date (e.g. 7th of every month). */
function generateMonthlyByDate(startDate: string, untilDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T12:00:00');
  const until = new Date(untilDate + 'T12:00:00');
  const dayOfMonth = start.getDate();
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= until) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), dayOfMonth, 12);
    if (d.getMonth() === cursor.getMonth() && d >= start && d <= until) {
      dates.push(localISO(d));
    }
    cursor.setMonth(cursor.getMonth() + 1);
    if (dates.length > 120) break;
  }
  return dates;
}

/** Monthly by Nth day-of-week (e.g. first Monday of every month). */
function generateMonthlyByDow(startDate: string, nth: number, dow: number, untilDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T12:00:00');
  const until = new Date(untilDate + 'T12:00:00');
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= until) {
    const firstDow = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
    const dayOfMonth = 1 + ((dow - firstDow + 7) % 7) + (nth - 1) * 7;
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), dayOfMonth, 12);
    if (d.getMonth() === cursor.getMonth() && d >= start && d <= until) {
      dates.push(localISO(d));
    }
    cursor.setMonth(cursor.getMonth() + 1);
    if (dates.length > 120) break;
  }
  return dates;
}

function getNthDow(dateStr: string): { nth: number; dow: number } {
  const d = new Date(dateStr + 'T12:00:00');
  return { dow: d.getDay(), nth: Math.ceil(d.getDate() / 7) };
}

function monthlyDateLabel(dateStr: string): string {
  const day = new Date(dateStr + 'T12:00:00').getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
  return `${day}${suffix} of each month`;
}

function monthlyDowLabel(dateStr: string): string {
  const { nth, dow } = getNthDow(dateStr);
  return `${ORDINALS[Math.min(nth, 5)]} ${DOW_NAMES[dow]} of each month`;
}

type Frequency = 'weekly' | 'biweekly' | 'monthly-date' | 'monthly-dow';

interface Props {
  open: boolean;
  defaultDate: string;
  currentUserId: string;
  userDepts: Department[];
  profiles: Profile[];
  initialDept: Department | null;
  initialPersonal?: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function AddOrgEventPanel({ open, defaultDate, currentUserId, userDepts, profiles, initialDept, initialPersonal, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CalendarKind>('other');
  const [date, setDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(''); // multi-day all-day end date
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [department, setDepartment] = useState<Department | null>(initialDept);

  // Attendees — only relevant for dept events (not personal, not all-staff)
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendeeDropdownOpen, setAttendeeDropdownOpen] = useState(false);
  const attendeeRef = useRef<HTMLDivElement>(null);

  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [monthlyMode, setMonthlyMode] = useState<'date' | 'dow'>('date');
  const [daysOfWeek, setDaysOfWeek] = useState<Set<number>>(() => new Set([new Date().getDay()]));
  const [untilMode, setUntilMode] = useState<'date' | 'indefinite'>('date');
  const [untilDate, setUntilDate] = useState(() => addMonths(localISO(new Date()), 3));

  const [isPersonal, setIsPersonal] = useState(initialPersonal ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setDate(defaultDate); }, [defaultDate]);
  useEffect(() => { setDepartment(initialDept); }, [initialDept]);
  useEffect(() => { setIsPersonal(initialPersonal ?? false); }, [initialPersonal]);

  function toggleDay(dow: number) {
    setDaysOfWeek((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) { if (next.size > 1) next.delete(dow); }
      else next.add(dow);
      return next;
    });
  }

  const isMonthly = frequency === 'monthly-date' || frequency === 'monthly-dow';
  const effectiveUntil = untilMode === 'indefinite'
    ? addMonths(date, isMonthly ? 24 : 12)
    : untilDate;

  const occurrenceDates: string[] = (() => {
    if (!recurring) return [date];
    if (frequency === 'monthly-date') return generateMonthlyByDate(date, effectiveUntil);
    if (frequency === 'monthly-dow') {
      const { nth, dow } = getNthDow(date);
      return generateMonthlyByDow(date, nth, dow, effectiveUntil);
    }
    return generateDates(date, frequency, [...daysOfWeek], effectiveUntil);
  })();

  const canSubmit = title.trim() && date && (allDay || startTime) && occurrenceDates.length > 0;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const recurrenceId = recurring && occurrenceDates.length > 1 ? crypto.randomUUID() : null;
      const multiDayEnd = allDay && !recurring && endDate && endDate > date ? endDate : null;

      const inputs = occurrenceDates.map((d) => ({
        kind,
        title: title.trim(),
        starts_at: allDay ? `${d}T00:00:00+00:00` : withTzOffset(d, startTime),
        ends_at: multiDayEnd
          ? `${multiDayEnd}T00:00:00+00:00`
          : !allDay && endTime
            ? withTzOffset(d, endTime)
            : null,
        all_day: allDay,
        location: location.trim() || null,
        recurrence_id: recurrenceId,
        created_by: currentUserId,
        department: isPersonal ? null : department,
        is_personal: isPersonal,
      }));

      const createdIds = await createCalendarEvents(inputs);

      // For dept events, add creator + chosen attendees so the event shows on their widgets
      if (!isPersonal && department && createdIds.length > 0) {
        const allAttendees = Array.from(new Set([currentUserId, ...attendeeIds]));
        await addEventAttendees(createdIds, title.trim(), allAttendees, currentUserId);
      }

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
    setEndDate('');
    setStartTime('09:00');
    setEndTime('');
    setLocation('');
    setAllDay(false);
    setRecurring(false);
    setFrequency('weekly');
    setMonthlyMode('date');
    setDaysOfWeek(new Set([new Date().getDay()]));
    setUntilMode('date');
    setUntilDate(addMonths(localISO(new Date()), 3));
    setDepartment(initialDept);
    setIsPersonal(false);
    setAttendeeIds([]);
    setAttendeeSearch('');
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const FREQ_BUTTONS: { value: Frequency; label: string }[] = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Every 2 weeks' },
    { value: 'monthly-date', label: 'Monthly' },
  ];

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
            onChange={(e) => { setAllDay(e.target.checked); setEndDate(''); }}
            className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
          />
          All day
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className={allDay ? 'col-span-1' : 'col-span-2'}>
            <label className="field-label">{recurring ? 'Start date' : allDay && !recurring ? 'Start date' : 'Date'}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="field-input"
            />
          </div>

          {/* End date — only for all-day, non-recurring events */}
          {allDay && !recurring && (
            <div>
              <label className="field-label">
                End date <span className="font-normal text-sparrow-gray">(optional)</span>
              </label>
              <input
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
                className="field-input"
              />
            </div>
          )}

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

        {/* Attendees — dept events only */}
        {!isPersonal && department && (
          <div ref={attendeeRef} className="relative">
            <label className="field-label">
              Attendees <span className="font-normal text-sparrow-gray">(optional — adds event to their widget)</span>
            </label>
            {attendeeIds.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attendeeIds.map((id) => {
                  const p = profiles.find((x) => x.id === id);
                  return (
                    <span key={id} className="flex items-center gap-1 rounded-full bg-sparrow-sage px-2.5 py-0.5 text-xs font-medium text-sparrow-ink">
                      {p?.full_name ?? id}
                      <button
                        type="button"
                        onClick={() => setAttendeeIds((prev) => prev.filter((x) => x !== id))}
                        className="ml-0.5 text-sparrow-gray hover:text-sparrow-ink"
                        aria-label={`Remove ${p?.full_name ?? id}`}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <input
              type="text"
              value={attendeeSearch}
              onChange={(e) => { setAttendeeSearch(e.target.value); setAttendeeDropdownOpen(true); }}
              onFocus={() => setAttendeeDropdownOpen(true)}
              onBlur={() => setTimeout(() => setAttendeeDropdownOpen(false), 150)}
              placeholder="Search staff…"
              className="field-input"
            />
            {attendeeDropdownOpen && attendeeSearch.trim() && (
              <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-sparrow-rule bg-white shadow-lg">
                {profiles
                  .filter((p) =>
                    p.id !== currentUserId &&
                    !attendeeIds.includes(p.id) &&
                    p.full_name.toLowerCase().includes(attendeeSearch.toLowerCase()),
                  )
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onMouseDown={() => {
                          setAttendeeIds((prev) => [...prev, p.id]);
                          setAttendeeSearch('');
                          setAttendeeDropdownOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-sparrow-ink hover:bg-sparrow-mist"
                      >
                        {p.full_name}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-sparrow-gray">You're always added as attending. Selected staff will be notified.</p>
          </div>
        )}

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
                  {FREQ_BUTTONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        const isNowMonthly = value === 'monthly-date' || value === 'monthly-dow';
                        setFrequency(value);
                        if (isNowMonthly && untilMode === 'date') {
                          setUntilDate(addMonths(date, 24));
                        }
                      }}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        (value === 'monthly-date' && isMonthly) || frequency === value
                          ? 'bg-sparrow-green text-white'
                          : 'bg-sparrow-mist text-sparrow-gray hover:text-sparrow-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Days of week — weekly / biweekly only */}
              {!isMonthly && (
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
              )}

              {/* Monthly sub-options */}
              {isMonthly && (
                <div className="space-y-2">
                  <label className="field-label">Repeat on</label>
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-sparrow-ink">
                    <input
                      type="radio"
                      checked={monthlyMode === 'date'}
                      onChange={() => { setMonthlyMode('date'); setFrequency('monthly-date'); }}
                      className="mt-0.5 h-4 w-4 border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
                    />
                    <span>
                      <span className="font-medium">{date ? monthlyDateLabel(date) : '—'}</span>
                      <span className="ml-1.5 text-sparrow-gray">(same date each month)</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-sparrow-ink">
                    <input
                      type="radio"
                      checked={monthlyMode === 'dow'}
                      onChange={() => { setMonthlyMode('dow'); setFrequency('monthly-dow'); }}
                      className="mt-0.5 h-4 w-4 border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
                    />
                    <span>
                      <span className="font-medium">{date ? monthlyDowLabel(date) : '—'}</span>
                      <span className="ml-1.5 text-sparrow-gray">(same weekday each month)</span>
                    </span>
                  </label>
                </div>
              )}

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
                  ? 'No dates match — check your settings and date range.'
                  : `This will create ${occurrenceDates.length} event${occurrenceDates.length !== 1 ? 's' : ''}.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
