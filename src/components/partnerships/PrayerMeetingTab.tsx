import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import {
  consecutiveMissedMonths,
  fetchMeetingsWithAttendance,
  fetchPrayerVolunteers,
  logPrayerMeeting,
  syncPrayerVolunteersFromDirectory,
  updatePrayerVolunteerNotes,
  updatePrayerVolunteerSnooze,
  type MeetingWithAttendance,
  type PrayerVolunteer,
} from '@/lib/prayer';
import { supabase } from '@/lib/supabase';

// How many months after a snoozed volunteer's stated return date we wait,
// with still no attendance, before prompting one more check-in.
const SNOOZE_BUFFER_MONTHS = 2;

const MISS_SCRIPTS: Record<2 | 3 | 4, (name: string, meetingDate: string) => string> = {
  2: (name, meetingDate) =>
    `Hey ${name}, we've missed you at prayer meeting the last couple months — just wanted to check in and see how you're doing! We'd love to see you at prayer in ${nextMonthName(meetingDate)}.`,
  3: (name) =>
    `Hey ${name}, we've noticed you've been away from prayer meeting for a few months now — no worries at all, we just wanted to check in! If you're not able to make it this month but you'd still like to stay involved, just let us know. If we don't hear back or see you at any prayer meetings this month, we'll go ahead and move you off the active roster to help make sure we don't keep sending you check-ins if now just isn't the season for it. We so value your time and capacity.`,
  4: (name) =>
    `Hey ${name}, we so appreciate the heart and time you've given as a Sparrow Prayer Volunteer. Because of the sensitive information we share with our prayer team, that role comes with a monthly attendance commitment — and it looks like that's not something that fits your season right now, so we've moved you off the active roster. We'd still love for you to stay connected — feel free to stay subscribed (or subscribe) to The Sparrow Monthly at sparrowinc.org for updates and prayer requests, and keep praying for us anytime. And if things change and you'd like to rejoin the prayer team down the road, just reach out to us at partnerships@sparrowinc.org — we'd love to have you back.`,
};

const SNOOZE_CHECK_SCRIPT = (name: string) =>
  `Hey ${name}, just checking in since it's been a little while — no worries at all! If you're not able to make it this month but you'd still like to stay involved, just let us know. If we don't hear back or see you at any prayer meetings this month, we'll go ahead and move you off the active roster to help make sure we don't keep sending you check-ins if now just isn't the season for it. We so value your time and capacity.`;

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function addMonthsISO(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-CA');
}

function nextMonthName(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString(undefined, { month: 'long' });
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ── Log meeting panel ─────────────────────────────────────────────────

function LogMeetingPanel({
  volunteers,
  onSaved,
  onCancel,
}: {
  volunteers: PrayerVolunteer[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayISO);
  const [notes, setNotes] = useState('');
  const [attended, setAttended] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(volunteers.map((v) => [v.id, false])),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { fieldClass, fieldError, clear, validate } = useRequiredFields([
    { key: 'prayer-meeting-date', label: 'Meeting date', valid: date.trim().length > 0 },
  ]);

  function toggle(id: string) {
    setAttended((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function save() {
    if (!validate()) return;
    if (!profile?.id) return;
    setBusy(true);
    setErr(null);
    try {
      const attendanceRows = volunteers.map((v) => ({ volunteer_id: v.id, attended: attended[v.id] ?? false }));
      await logPrayerMeeting(date, notes.trim() || null, profile.id, attendanceRows);

      // Missed-month ladder — runs per volunteer off this meeting's attendance.
      // See the instructions box at the top of the tab for the full policy.
      for (const v of volunteers) {
        const didAttend = attended[v.id] ?? false;

        if (didAttend) {
          // Attendance always wins — clears any snooze and closes any open check-in task.
          if (v.snoozed_until) await updatePrayerVolunteerSnooze(v.id, null);
          await supabase.rpc('resolve_system_task', { p_system: 'crm', p_ref: `prayer_miss:${v.id}` });
          await supabase.rpc('resolve_system_task', { p_system: 'crm', p_ref: `prayer_snooze_check:${v.id}` });
          continue;
        }

        if (v.snoozed_until) {
          // Paused by staff — the automatic ladder below is fully suppressed until
          // the buffer past their stated return date, at which point it's one
          // single check-in, not a resumption of the normal 2/3/4 sequence.
          if (date >= addMonthsISO(v.snoozed_until, SNOOZE_BUFFER_MONTHS)) {
            await supabase.rpc('emit_system_task', {
              p_system: 'crm',
              p_ref: `prayer_snooze_check:${v.id}`,
              p_assignee: profile.id,
              p_title: `Prayer volunteer check-in — ${v.full_name} (snoozed, still no-show)`,
              p_department: 'partnerships',
              p_priority: 'p3',
              p_due: todayISO(),
              p_notes: SNOOZE_CHECK_SCRIPT(v.full_name),
            });
          }
          continue;
        }

        const streak = await consecutiveMissedMonths(v.id);
        if (streak >= 2) {
          const rung = (streak >= 4 ? 4 : streak) as 2 | 3 | 4;
          await supabase.rpc('emit_system_task', {
            p_system: 'crm',
            p_ref: `prayer_miss:${v.id}`,
            p_assignee: profile.id,
            p_title: `Prayer volunteer check-in — ${v.full_name} (${streak} month${streak === 1 ? '' : 's'} missed)`,
            p_department: 'partnerships',
            p_priority: rung === 4 ? 'p2' : 'p3',
            p_due: todayISO(),
            p_notes: MISS_SCRIPTS[rung](v.full_name, date),
          });
        }
      }

      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save meeting.');
    } finally {
      setBusy(false);
    }
  }

  const attendedCount = Object.values(attended).filter(Boolean).length;

  return (
    <div className="rounded-2xl border border-sparrow-green/30 bg-white dark:bg-sparrow-dark-surface p-4 space-y-4 shadow-card">
      <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Log this week's meeting</p>

      <div>
        <label className="field-label field-label-required" htmlFor="prayer-meeting-date">Meeting date</label>
        <input
          id="prayer-meeting-date"
          type="date"
          className={fieldClass('prayer-meeting-date')}
          value={date}
          onChange={(e) => { setDate(e.target.value); clear('prayer-meeting-date'); }}
        />
        {fieldError('prayer-meeting-date') && (
          <p className="mt-1 text-xs text-priority-p1">{fieldError('prayer-meeting-date')}</p>
        )}
      </div>

      <div>
        <p className="field-label mb-2">Attendance ({attendedCount}/{volunteers.length})</p>
        <div className="space-y-2">
          {volunteers.length === 0 && (
            <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No active volunteers yet — add some below.</p>
          )}
          {volunteers.map((v) => (
            <label key={v.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border px-3 py-2 hover:bg-sparrow-mist/40 dark:hover:bg-sparrow-dark-surface2">
              <input
                type="checkbox"
                checked={attended[v.id] ?? false}
                onChange={() => toggle(v.id)}
                className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green"
              />
              <span className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{v.full_name}</span>
              {v.phone && <span className="ml-auto text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{v.phone}</span>}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="field-label">Meeting notes</label>
        <textarea
          rows={3}
          className="field-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How did it go? Prayer requests, anything notable…"
        />
      </div>

      {err && <p className="text-sm text-priority-p1">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="btn-primary flex-1">
          {busy ? 'Saving…' : 'Save meeting'}
        </button>
        <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────

type Section = 'meetings' | 'volunteers';

export function PrayerMeetingTab() {
  const [section, setSection] = useState<Section>('meetings');
  const [volunteers, setVolunteers] = useState<PrayerVolunteer[]>([]);
  const [meetings, setMeetings] = useState<MeetingWithAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);
  const [loggingMeeting, setLoggingMeeting] = useState(false);
  const [editVolunteerId, setEditVolunteerId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editSnoozeId, setEditSnoozeId] = useState<string | null>(null);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [missStreaks, setMissStreaks] = useState<Record<string, number>>({});
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      // One door: Directory (Prayer type/tag) decides who's on the roster — refresh it
      // here before reading, same opportunistic-sync pattern the rest of the room uses.
      await syncPrayerVolunteersFromDirectory().catch(() => undefined);
      const [vols, mtgs] = await Promise.all([
        fetchPrayerVolunteers(),
        fetchMeetingsWithAttendance(),
      ]);
      if (!mounted.current) return;
      setVolunteers(vols);
      setMeetings(mtgs);
      setNotReady(false);

      // Miss-streak badges — purely informational, computed for whoever isn't snoozed.
      const toCheck = vols.filter((v) => v.active && !v.snoozed_until);
      const streaks = await Promise.all(toCheck.map((v) => consecutiveMissedMonths(v.id).catch(() => 0)));
      if (!mounted.current) return;
      setMissStreaks(Object.fromEntries(toCheck.map((v, i) => [v.id, streaks[i]])));
    } catch (e) {
      if (!mounted.current) return;
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('relation') && msg.includes('does not exist')) {
        setNotReady(true);
      }
      // Other errors: silently fail (don't crash the tab)
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  async function saveVolunteerNotes(id: string) {
    await updatePrayerVolunteerNotes(id, editNotes.trim() || null);
    setEditVolunteerId(null);
    void load();
  }

  async function saveSnooze(id: string) {
    if (!snoozeDate) return;
    await updatePrayerVolunteerSnooze(id, snoozeDate);
    setEditSnoozeId(null);
    void load();
  }

  async function clearSnooze(id: string) {
    await updatePrayerVolunteerSnooze(id, null);
    void load();
  }

  const activeVolunteers = volunteers.filter((v) => v.active);
  const inactiveVolunteers = volunteers.filter((v) => !v.active);

  if (loading) return <p className="py-8 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading prayer log…</p>;

  if (notReady) {
    return (
      <div className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/40 dark:bg-black/20 px-6 py-8 text-center">
        <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Prayer meeting log not set up yet</p>
        <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Migration 0043 needs to run first. Byron will handle this.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-1 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/40 dark:bg-sparrow-dark-surface2 p-0.5 w-fit">
        {(['meetings', 'volunteers'] as Section[]).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`rounded px-3 py-1.5 text-sm font-medium capitalize transition ${
              section === s ? 'bg-white dark:bg-sparrow-dark-surface shadow-sm text-sparrow-ink dark:text-sparrow-dark-ink' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
            }`}
          >
            {s === 'meetings' ? `Meeting log${meetings.length > 0 ? ` (${meetings.length})` : ''}` : `Volunteers (${activeVolunteers.length})`}
          </button>
        ))}
      </div>

      {/* ── Meeting log ── */}
      {section === 'meetings' && (
        <div className="space-y-4">
          {/* How missed meetings are handled */}
          <div className="rounded-xl border border-sparrow-gold/30 bg-sparrow-cream dark:bg-sparrow-dark-surface2 px-4 py-3 text-sm">
            <p className="font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">How we handle missed meetings</p>
            <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              This runs automatically off the attendance log below — a task lands on Partnerships Home
              with a ready-to-send message at each step. Everything here is{' '}
              <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">strongly recommended, not required</span>
              {' '}— use your judgment on any individual volunteer.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { n: 1, label: '1 month missed', detail: 'Nothing happens — completely normal.' },
                { n: 2, label: '2 months missed', detail: 'Task + script: "we\'ve missed you."' },
                { n: 3, label: '3 months missed', detail: 'Task + script: "still interested?"' },
                { n: 4, label: '4 months missed', detail: 'Task + script suggesting removal from the active roster.' },
              ].map((step) => (
                <div key={step.n} className="rounded-lg border border-sparrow-gold/20 bg-white/60 dark:bg-black/20 px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sparrow-green dark:bg-sparrow-dark-green text-[11px] font-semibold text-white">
                      {step.n}
                    </span>
                    <span className="text-xs font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{step.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{step.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-1.5 border-t border-sparrow-gold/30 pt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              <p>
                <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">If someone reaches out</span> — anytime,
                prompted or not — go to the Volunteers tab and set <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">"Snooze until."</span>{' '}
                Pick the date they said they'd be back (any date is fine if it's open-ended). This pauses the steps above completely.
              </p>
              <p>
                Two months after that date, if they still haven't shown up, you'll get one more task — a gentle "still interested?"
                check. What happens after that is your call: snooze them again, or let it move toward removal.
              </p>
              <p>
                <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Nothing here removes anyone automatically.</span>{' '}
                Every step just hands you a task and a message — marking someone inactive in Directory is always something you decide and do yourself.
              </p>
              <p>
                <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">These scripts are for silence, not for someone you're already talking to.</span>{' '}
                They're built for two situations: a true no-call-no-show (you haven't heard from them at all), or a volunteer who keeps
                saying "yes, still interested" every time you check in but attendance never actually follows — at some point, continuing
                to just wait isn't fair to either of you, and it's fine to let the roster move forward. If someone's working out real
                logistics with you (like a specific date they'll be back), use Snooze instead and let that play out — these scripts
                aren't for them.
              </p>
            </div>
          </div>

          {!loggingMeeting && (
            <button onClick={() => setLoggingMeeting(true)} className="btn-primary">
              + Log this week's meeting
            </button>
          )}

          {loggingMeeting && (
            <LogMeetingPanel
              volunteers={activeVolunteers}
              onSaved={() => { setLoggingMeeting(false); void load(); }}
              onCancel={() => setLoggingMeeting(false)}
            />
          )}

          {meetings.length === 0 && !loggingMeeting && (
            <p className="py-6 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No meetings logged yet. Log the first one above.</p>
          )}

          <div className="space-y-2">
            {meetings.map((m) => {
              const total = m.attendance.length;
              const present = m.attendance.filter((a) => a.attended).length;
              const isExpanded = expandedMeeting === m.id;

              return (
                <div key={m.id} className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
                  <button
                    onClick={() => setExpandedMeeting(isExpanded ? null : m.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{shortDate(m.meeting_date)}</p>
                      {m.notes && (
                        <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray line-clamp-1">{m.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        total > 0 && present === total
                          ? 'bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green'
                          : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      }`}>
                        {total > 0 ? `${present}/${total} attended` : 'No volunteers tracked'}
                      </span>
                      <span className="text-sparrow-gray dark:text-sparrow-dark-gray">{isExpanded ? '↑' : '↓'}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border px-4 pb-4 pt-3 space-y-3">
                      {m.notes && (
                        <div className="rounded-lg bg-sparrow-mist/60 dark:bg-sparrow-dark-surface2 px-3 py-2">
                          <p className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray uppercase tracking-wide mb-1">Notes</p>
                          <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{m.notes}</p>
                        </div>
                      )}
                      <div className="space-y-1">
                        {m.attendance.map((a) => {
                          const vol = volunteers.find((v) => v.id === a.volunteer_id);
                          return (
                            <div key={a.volunteer_id} className="flex items-center gap-2 text-sm">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${a.attended ? 'bg-sparrow-green' : 'bg-slate-300'}`} />
                              <span className={a.attended ? 'text-sparrow-ink dark:text-sparrow-dark-ink' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}>
                                {vol?.full_name ?? 'Unknown'}
                              </span>
                              {!a.attended && <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">(absent)</span>}
                            </div>
                          );
                        })}
                        {m.attendance.length === 0 && (
                          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No attendance recorded for this meeting.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Volunteer roster ── */}
      {section === 'volunteers' && (
        <div className="space-y-4">
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            This roster follows Directory automatically — tag someone as "Prayer volunteer"
            there (Type or "Also involved as") to add them here; remove the tag to take them
            off the active roster. Nothing to add or archive from this screen.
          </p>

          {activeVolunteers.length === 0 && (
            <p className="py-6 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
              No active prayer volunteers yet — tag someone in Directory to see them here.
            </p>
          )}

          <div className="space-y-2">
            {activeVolunteers.map((v) => (
              <div key={v.id} className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{v.full_name}</p>
                  {v.snoozed_until ? (
                    <span className="rounded-full bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                      Snoozed until {shortDate(v.snoozed_until)}
                    </span>
                  ) : (missStreaks[v.id] ?? 0) > 0 ? (
                    <span className="rounded-full bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                      {missStreaks[v.id]} {missStreaks[v.id] === 1 ? 'month' : 'months'} missed
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  {v.phone && <span>{v.phone}</span>}
                  {v.email && <span>{v.email}</span>}
                </div>

                {/* Notes — inline edit */}
                {editVolunteerId === v.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      rows={2}
                      className="field-input mt-0"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => void saveVolunteerNotes(v.id)} className="btn-primary py-1 text-xs">Save</button>
                      <button onClick={() => setEditVolunteerId(null)} className="btn-secondary py-1 text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    {v.notes ? (
                      <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{v.notes}</p>
                    ) : (
                      <p className="text-xs italic text-sparrow-gray/60">No notes</p>
                    )}
                    <button
                      onClick={() => { setEditVolunteerId(v.id); setEditNotes(v.notes ?? ''); }}
                      className="mt-1 text-xs text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                    >
                      {v.notes ? 'Edit notes' : 'Add notes'}
                    </button>
                  </div>
                )}

                {/* Snooze — pause the missed-month ladder when someone's given a heads-up */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sparrow-rule dark:border-sparrow-dark-border pt-3">
                  {editSnoozeId === v.id ? (
                    <>
                      <input
                        type="date"
                        className="field-input mt-0 w-auto"
                        value={snoozeDate}
                        onChange={(e) => setSnoozeDate(e.target.value)}
                      />
                      <button onClick={() => void saveSnooze(v.id)} className="btn-primary py-1 text-xs">Save</button>
                      <button onClick={() => setEditSnoozeId(null)} className="btn-secondary py-1 text-xs">Cancel</button>
                    </>
                  ) : v.snoozed_until ? (
                    <>
                      <button
                        onClick={() => { setEditSnoozeId(v.id); setSnoozeDate(v.snoozed_until ?? todayISO()); }}
                        className="text-xs text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                      >
                        Change snooze date
                      </button>
                      <button onClick={() => void clearSnooze(v.id)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:underline">
                        Clear snooze
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setEditSnoozeId(v.id); setSnoozeDate(todayISO()); }}
                      className="text-xs text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                    >
                      Snooze until…
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {inactiveVolunteers.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
                No longer active ({inactiveVolunteers.length})
              </summary>
              <div className="mt-2 space-y-2">
                {inactiveVolunteers.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-xl border border-sparrow-rule/60 bg-sparrow-mist/40 dark:bg-black/20 px-4 py-2.5">
                    <span className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{v.full_name}</span>
                    <span className="text-xs text-sparrow-gray/70">No longer tagged in Directory</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
