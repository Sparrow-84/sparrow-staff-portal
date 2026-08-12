import { useEffect, useRef, useState } from 'react';
import { EVENT_LABEL, type EventKind } from '@/lib/lcp-types';
import { createEvents, fetchLcpSessionCalendarEventIds } from '@/lib/lcp';
import { addEventAttendees } from '@/lib/calendar';
import { Drawer } from './Drawer';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import type { Profile } from '@/lib/types';

const EVENT_KINDS: EventKind[] = ['curriculum', 'one_on_one', 'dinner', 'volunteer', 'other'];
const DOW_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayISO() {
  return localISO(new Date());
}

function withTzOffset(dateStr: string, timeStr: string): string {
  const d = new Date(`${dateStr}T${timeStr}:00`);
  const offset = -d.getTimezoneOffset(); // minutes ahead of UTC
  const sign = offset >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const mm = String(Math.abs(offset) % 60).padStart(2, '0');
  return `${dateStr}T${timeStr}:00${sign}${hh}:${mm}`;
}

function addMonths(dateStr: string, months: number) {
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

  // Align cursor to the Sunday of the start week
  const cursor = new Date(start);
  cursor.setDate(start.getDate() - start.getDay());

  const step = frequency === 'weekly' ? 7 : 14;

  while (cursor <= until) {
    for (const dow of [...daysOfWeek].sort((a, b) => a - b)) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + dow);
      if (d >= start && d <= until) {
        dates.push(localISO(d));
      }
    }
    cursor.setDate(cursor.getDate() + step);
    if (dates.length > 300) break; // safety cap
  }
  return dates;
}

interface Props {
  open: boolean;
  currentUserId: string;
  profiles: Profile[];
  onClose: () => void;
  onCreated: () => void;
}

export function AddEventPanel({ open, currentUserId, profiles, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<EventKind>('curriculum');
  const [date, setDate] = useState(todayISO);
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [mandatory, setMandatory] = useState(true);
  const [familyVisible, setFamilyVisible] = useState(false);
  // NOTE: restore showOnOrgCal state after Byron runs migration 0039
  // const [showOnOrgCal, setShowOnOrgCal] = useState(false);

  // Attendees — same pattern as AddOrgEventPanel; picked staff get RSVP'd on
  // the real calendar_events row this session syncs into (migration 0114).
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendeeDropdownOpen, setAttendeeDropdownOpen] = useState(false);
  const attendeeRef = useRef<HTMLDivElement>(null);

  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly'>('weekly');
  const [daysOfWeek, setDaysOfWeek] = useState<Set<number>>(() => {
    return new Set([new Date().getDay()]);
  });
  const [untilMode, setUntilMode] = useState<'date' | 'indefinite'>('date');
  const [untilDate, setUntilDate] = useState(() => addMonths(todayISO(), 3));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const daysOfWeekTouchedRef = useRef(false);

  // Keep the day-of-week picker in sync with the chosen start date until the
  // staff member manually picks a day — otherwise today's weekday (whatever day
  // the form happened to be opened) stays checked even after the date changes,
  // silently creating extra recurring events on the wrong day.
  useEffect(() => {
    if (!daysOfWeekTouchedRef.current) {
      setDaysOfWeek(new Set([new Date(date + 'T12:00:00').getDay()]));
    }
  }, [date]);

  function toggleDay(dow: number) {
    daysOfWeekTouchedRef.current = true;
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

  const { missingMessage, validate, fieldClass, fieldError, clear, reset: resetValidation } = useRequiredFields([
    { key: 'lcp-event-title', label: 'Title', valid: title.trim().length > 0 },
    { key: 'lcp-event-date', label: 'Date', valid: !!date },
    { key: 'lcp-event-start-time', label: 'Start time', valid: !!startTime },
    { key: 'lcp-event-recurrence', label: 'Repeat settings (no matching dates)', valid: occurrenceDates.length > 0 },
  ]);

  async function submit() {
    if (!validate() || submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const recurrenceId = recurring && occurrenceDates.length > 1
        ? crypto.randomUUID()
        : null;

      const inputs = occurrenceDates.map((d) => ({
        title: title.trim(),
        kind,
        starts_at: withTzOffset(d, startTime),
        ends_at: endTime ? withTzOffset(d, endTime) : null,
        location: location.trim() || null,
        mandatory,
        recurrence_id: recurrenceId,
        lcp_family_visible: familyVisible,
        // NOTE: restore show_on_org_calendar: showOnOrgCal after Byron runs migration 0039
        created_by: currentUserId,
      }));

      const insertedIds = await createEvents(inputs);

      if (attendeeIds.length > 0 && insertedIds.length > 0) {
        const mirrorIds = await fetchLcpSessionCalendarEventIds(insertedIds);
        if (mirrorIds.length > 0) {
          const allAttendees = Array.from(new Set([currentUserId, ...attendeeIds]));
          await addEventAttendees(mirrorIds, title.trim(), allAttendees, currentUserId);
        }
      }

      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save event.');
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  function reset() {
    setTitle('');
    setKind('curriculum');
    setDate(todayISO());
    setStartTime('18:00');
    setEndTime('');
    setLocation('');
    setMandatory(true);
    setRecurring(false);
    setFrequency('weekly');
    setDaysOfWeek(new Set([new Date().getDay()]));
    setUntilMode('date');
    setUntilDate(addMonths(todayISO(), 3));
    setAttendeeIds([]);
    setAttendeeSearch('');
    setError(null);
    daysOfWeekTouchedRef.current = false;
    resetValidation();
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
          {(error || missingMessage) && <p className="text-sm text-priority-p1">{error ?? missingMessage}</p>}
          <button
            onClick={submit}
            disabled={saving}
            className="btn-primary w-full"
          >
            {submitLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-5">

        {/* Title */}
        <div>
          <label className="field-label field-label-required" htmlFor="lcp-event-title">Title</label>
          <input
            id="lcp-event-title"
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); clear('lcp-event-title'); }}
            placeholder="e.g. Monday Mentoring"
            className={fieldClass('lcp-event-title')}
          />
          {fieldError('lcp-event-title') && <p className="mt-1 text-xs text-priority-p1">{fieldError('lcp-event-title')}</p>}
        </div>

        {/* Kind */}
        <div>
          <label className="field-label">Type</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as EventKind)} className="field-input">
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>{EVENT_LABEL[k]}</option>
            ))}
          </select>
        </div>

        {/* Date + Times */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="field-label field-label-required" htmlFor="lcp-event-date">{recurring ? 'Start date' : 'Date'}</label>
            <input
              id="lcp-event-date"
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); clear('lcp-event-date'); }}
              className={fieldClass('lcp-event-date')}
            />
            {fieldError('lcp-event-date') && <p className="mt-1 text-xs text-priority-p1">{fieldError('lcp-event-date')}</p>}
          </div>
          <div>
            <label className="field-label field-label-required" htmlFor="lcp-event-start-time">Start time</label>
            <input
              id="lcp-event-start-time"
              type="time"
              value={startTime}
              onChange={(e) => { setStartTime(e.target.value); clear('lcp-event-start-time'); }}
              className={fieldClass('lcp-event-start-time')}
            />
            {fieldError('lcp-event-start-time') && <p className="mt-1 text-xs text-priority-p1">{fieldError('lcp-event-start-time')}</p>}
          </div>
          <div>
            <label className="field-label">End time <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional)</span></label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="field-input"
            />
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="field-label">Location <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional)</span></label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. LCP House"
            className="field-input"
          />
        </div>

        {/* Mandatory */}
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
          <input
            type="checkbox"
            checked={mandatory}
            onChange={(e) => setMandatory(e.target.checked)}
            className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
          />
          Mandatory attendance
        </label>

        {/* Family visibility */}
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
          <input
            type="checkbox"
            checked={familyVisible}
            onChange={(e) => setFamilyVisible(e.target.checked)}
            className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
          />
          Show to LCP families{' '}
          <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(just the name, date, and time — nothing else)</span>
        </label>

        {/* Attendees — mirrors AddOrgEventPanel's picker */}
        <div ref={attendeeRef} className="relative">
          <label className="field-label">
            Attendees <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional — adds session to their widget)</span>
          </label>
          {attendeeIds.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attendeeIds.map((id) => {
                const p = profiles.find((x) => x.id === id);
                return (
                  <span key={id} className="flex items-center gap-1 rounded-full bg-sparrow-sage px-2.5 py-0.5 text-xs font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
                    {p?.full_name ?? id}
                    <button
                      type="button"
                      onClick={() => setAttendeeIds((prev) => prev.filter((x) => x !== id))}
                      className="ml-0.5 text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
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
            <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface shadow-lg">
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
                      className="w-full px-3 py-2 text-left text-sm text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                    >
                      {p.full_name}
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">You're always added as attending. Selected staff will be notified.</p>
        </div>

        {/* NOTE: restore this checkbox after Byron runs migration 0039
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
          <input
            type="checkbox"
            checked={showOnOrgCal}
            onChange={(e) => setShowOnOrgCal(e.target.checked)}
            className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
          />
          Also show on all-staff calendar
        </label>
        */}

        {/* Recurrence toggle */}
        <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
            />
            Repeat this event
          </label>

          {recurring && (
            <div className="mt-4 space-y-4">

              {/* Frequency */}
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
                          : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
                      }`}
                    >
                      {f === 'weekly' ? 'Weekly' : 'Every 2 weeks'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Days of week */}
              <div>
                <label className="field-label field-label-required">On these days</label>
                <div className="mt-1 flex gap-1.5">
                  {DOW_ABBR.map((abbr, dow) => (
                    <button
                      key={dow}
                      type="button"
                      onClick={() => toggleDay(dow)}
                      className={`h-8 w-8 rounded-full text-xs font-semibold transition ${
                        daysOfWeek.has(dow)
                          ? 'bg-sparrow-green text-white'
                          : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
                      }`}
                    >
                      {abbr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Until date */}
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
                          : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
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

              {/* Preview */}
              <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
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
