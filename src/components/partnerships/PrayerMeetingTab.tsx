import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  consecutiveMisses,
  createPrayerVolunteer,
  fetchMeetingsWithAttendance,
  fetchPrayerVolunteers,
  logPrayerMeeting,
  updatePrayerVolunteer,
  type MeetingWithAttendance,
  type PrayerVolunteer,
} from '@/lib/prayer';
import { supabase } from '@/lib/supabase';

const MISS_THRESHOLD = 4;

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ── Add volunteer drawer ──────────────────────────────────────────────

function AddVolunteerForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createPrayerVolunteer({
        full_name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add volunteer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-sparrow-rule bg-sparrow-mist/40 p-4 space-y-3">
      <p className="text-sm font-medium text-sparrow-ink">Add prayer volunteer</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="field-label">Name</label>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        <div>
          <label className="field-label">Phone</label>
          <input className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="optional" />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
        </div>
        <div className="col-span-2">
          <label className="field-label">Notes</label>
          <textarea rows={2} className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
        </div>
      </div>
      {err && <p className="text-sm text-priority-p1">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={!name.trim() || busy} className="btn-primary flex-1">
          {busy ? 'Adding…' : 'Add volunteer'}
        </button>
        <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
      </div>
    </div>
  );
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

  function toggle(id: string) {
    setAttended((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function save() {
    if (!profile?.id) return;
    setBusy(true);
    setErr(null);
    try {
      const attendanceRows = volunteers.map((v) => ({ volunteer_id: v.id, attended: attended[v.id] ?? false }));
      await logPrayerMeeting(date, notes.trim() || null, profile.id, attendanceRows);

      // Check for 4-consecutive-miss flags — emit a task to the partnerships owner if needed
      const missed = volunteers.filter((v) => !attended[v.id]);
      for (const v of missed) {
        const streak = await consecutiveMisses(v.id);
        if (streak >= MISS_THRESHOLD) {
          // Emit a flag task via the spine system task function
          const due = new Date();
          due.setDate(due.getDate() + 3);
          await supabase.rpc('emit_system_task', {
            p_system: 'crm',
            p_ref: `prayer_miss:${v.id}`,
            p_assignee: profile.id,
            p_title: `Prayer volunteer check-in — ${v.full_name} (${streak} meetings missed)`,
            p_department: 'partnerships',
            p_priority: 'p3',
            p_due: due.toLocaleDateString('en-CA'),
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
    <div className="rounded-2xl border border-sparrow-green/30 bg-white p-4 space-y-4 shadow-card">
      <p className="font-medium text-sparrow-ink">Log this week's meeting</p>

      <div>
        <label className="field-label">Meeting date</label>
        <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div>
        <p className="field-label mb-2">Attendance ({attendedCount}/{volunteers.length})</p>
        <div className="space-y-2">
          {volunteers.length === 0 && (
            <p className="text-sm text-sparrow-gray">No active volunteers yet — add some below.</p>
          )}
          {volunteers.map((v) => (
            <label key={v.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-sparrow-rule px-3 py-2 hover:bg-sparrow-mist/40">
              <input
                type="checkbox"
                checked={attended[v.id] ?? false}
                onChange={() => toggle(v.id)}
                className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green"
              />
              <span className="text-sm font-medium text-sparrow-ink">{v.full_name}</span>
              {v.phone && <span className="ml-auto text-xs text-sparrow-gray">{v.phone}</span>}
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
  const [addingVolunteer, setAddingVolunteer] = useState(false);
  const [editVolunteerId, setEditVolunteerId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const [vols, mtgs] = await Promise.all([
        fetchPrayerVolunteers(),
        fetchMeetingsWithAttendance(),
      ]);
      if (!mounted.current) return;
      setVolunteers(vols);
      setMeetings(mtgs);
      setNotReady(false);
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

  async function archiveVolunteer(id: string) {
    await updatePrayerVolunteer(id, { active: false });
    void load();
  }

  async function saveVolunteerNotes(id: string) {
    await updatePrayerVolunteer(id, { notes: editNotes.trim() || null });
    setEditVolunteerId(null);
    void load();
  }

  const activeVolunteers = volunteers.filter((v) => v.active);
  const archivedVolunteers = volunteers.filter((v) => !v.active);

  if (loading) return <p className="py-8 text-sm text-sparrow-gray">Loading prayer log…</p>;

  if (notReady) {
    return (
      <div className="rounded-2xl border border-sparrow-rule bg-sparrow-mist/40 px-6 py-8 text-center">
        <p className="text-sm font-medium text-sparrow-ink">Prayer meeting log not set up yet</p>
        <p className="mt-1 text-xs text-sparrow-gray">Migration 0043 needs to run first. Byron will handle this.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-1 rounded-lg border border-sparrow-rule bg-sparrow-mist/40 p-0.5 w-fit">
        {(['meetings', 'volunteers'] as Section[]).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`rounded px-3 py-1.5 text-sm font-medium capitalize transition ${
              section === s ? 'bg-white shadow-sm text-sparrow-ink' : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {s === 'meetings' ? `Meeting log${meetings.length > 0 ? ` (${meetings.length})` : ''}` : `Volunteers (${activeVolunteers.length})`}
          </button>
        ))}
      </div>

      {/* ── Meeting log ── */}
      {section === 'meetings' && (
        <div className="space-y-4">
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
            <p className="py-6 text-center text-sm text-sparrow-gray">No meetings logged yet. Log the first one above.</p>
          )}

          <div className="space-y-2">
            {meetings.map((m) => {
              const total = m.attendance.length;
              const present = m.attendance.filter((a) => a.attended).length;
              const isExpanded = expandedMeeting === m.id;

              return (
                <div key={m.id} className="rounded-2xl border border-sparrow-rule bg-white">
                  <button
                    onClick={() => setExpandedMeeting(isExpanded ? null : m.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <p className="font-medium text-sparrow-ink">{shortDate(m.meeting_date)}</p>
                      {m.notes && (
                        <p className="mt-0.5 text-xs text-sparrow-gray line-clamp-1">{m.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        total > 0 && present === total
                          ? 'bg-sparrow-green/10 text-sparrow-green'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {total > 0 ? `${present}/${total} attended` : 'No volunteers tracked'}
                      </span>
                      <span className="text-sparrow-gray">{isExpanded ? '↑' : '↓'}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-sparrow-rule px-4 pb-4 pt-3 space-y-3">
                      {m.notes && (
                        <div className="rounded-lg bg-sparrow-mist/60 px-3 py-2">
                          <p className="text-xs font-medium text-sparrow-gray uppercase tracking-wide mb-1">Notes</p>
                          <p className="text-sm text-sparrow-ink">{m.notes}</p>
                        </div>
                      )}
                      <div className="space-y-1">
                        {m.attendance.map((a) => {
                          const vol = volunteers.find((v) => v.id === a.volunteer_id);
                          return (
                            <div key={a.volunteer_id} className="flex items-center gap-2 text-sm">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${a.attended ? 'bg-sparrow-green' : 'bg-slate-300'}`} />
                              <span className={a.attended ? 'text-sparrow-ink' : 'text-sparrow-gray'}>
                                {vol?.full_name ?? 'Unknown'}
                              </span>
                              {!a.attended && <span className="text-xs text-sparrow-gray">(absent)</span>}
                            </div>
                          );
                        })}
                        {m.attendance.length === 0 && (
                          <p className="text-xs text-sparrow-gray">No attendance recorded for this meeting.</p>
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
          {!addingVolunteer && (
            <button onClick={() => setAddingVolunteer(true)} className="btn-primary">
              + Add volunteer
            </button>
          )}

          {addingVolunteer && (
            <AddVolunteerForm
              onSaved={() => { setAddingVolunteer(false); void load(); }}
              onCancel={() => setAddingVolunteer(false)}
            />
          )}

          {activeVolunteers.length === 0 && !addingVolunteer && (
            <p className="py-6 text-center text-sm text-sparrow-gray">No active prayer volunteers yet.</p>
          )}

          <div className="space-y-2">
            {activeVolunteers.map((v) => (
              <div key={v.id} className="rounded-2xl border border-sparrow-rule bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sparrow-ink">{v.full_name}</p>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-sparrow-gray">
                      {v.phone && <span>{v.phone}</span>}
                      {v.email && <span>{v.email}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => void archiveVolunteer(v.id)}
                    className="shrink-0 text-xs text-sparrow-gray hover:text-priority-p1"
                  >
                    Archive
                  </button>
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
                      <p className="text-sm text-sparrow-gray">{v.notes}</p>
                    ) : (
                      <p className="text-xs italic text-sparrow-gray/60">No notes</p>
                    )}
                    <button
                      onClick={() => { setEditVolunteerId(v.id); setEditNotes(v.notes ?? ''); }}
                      className="mt-1 text-xs text-sparrow-green hover:underline"
                    >
                      {v.notes ? 'Edit notes' : 'Add notes'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {archivedVolunteers.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-sparrow-gray hover:text-sparrow-ink">
                Archived volunteers ({archivedVolunteers.length})
              </summary>
              <div className="mt-2 space-y-2">
                {archivedVolunteers.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-xl border border-sparrow-rule/60 bg-sparrow-mist/40 px-4 py-2.5">
                    <span className="text-sm text-sparrow-gray">{v.full_name}</span>
                    <button
                      onClick={() => { void updatePrayerVolunteer(v.id, { active: true }); void load(); }}
                      className="text-xs text-sparrow-green hover:underline"
                    >
                      Restore
                    </button>
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
