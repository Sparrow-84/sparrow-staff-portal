import { supabase } from './supabase';

// Prayer volunteer + meeting log data layer.
// All three tables (prayer_volunteers, prayer_meetings, prayer_attendance)
// are created by migration 0043. These functions fail gracefully if the
// migration hasn't run yet — the UI checks for a "relation does not exist"
// error and shows a "not set up yet" state instead of crashing.

export interface PrayerVolunteer {
  id: string;
  partner_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  snoozed_until: string | null;
  created_at: string;
}

export interface PrayerMeeting {
  id: string;
  meeting_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PrayerAttendance {
  id: string;
  meeting_id: string;
  volunteer_id: string;
  attended: boolean;
  created_at: string;
}

export interface MeetingWithAttendance extends PrayerMeeting {
  attendance: { volunteer_id: string; attended: boolean }[];
}

// ── Volunteers ────────────────────────────────────────────────────────

export async function fetchPrayerVolunteers(): Promise<PrayerVolunteer[]> {
  const { data, error } = await supabase
    .from('prayer_volunteers')
    .select('*')
    .order('full_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as PrayerVolunteer[];
}

export async function updatePrayerVolunteerNotes(id: string, notes: string | null): Promise<void> {
  const { error } = await supabase.from('prayer_volunteers').update({ notes }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Staff-set "pause" — when a volunteer gives a heads-up (prompted or not), Bethany sets this
 * to whatever date they expect to be back (any date is fine; there's no minimum). While set,
 * the automatic missed-month ladder in PrayerMeetingTab is suppressed entirely. Two months
 * after this date, if they still haven't attended, one follow-up check-in task fires — see
 * PrayerMeetingTab's save() for that logic. Attending a meeting always clears this
 * automatically, regardless of the date chosen.
 */
export async function updatePrayerVolunteerSnooze(id: string, snoozedUntil: string | null): Promise<void> {
  const { error } = await supabase.from('prayer_volunteers').update({ snoozed_until: snoozedUntil }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * One door: Directory (partners typed or tagged "Prayer volunteer") is the only place
 * Bethany manages who's a prayer volunteer. This mirrors that into the roster the meeting
 * attendance log actually points at (migration 0043's prayer_volunteers.partner_id link,
 * previously optional and unused) — every active, Prayer-tagged partner gets a roster row
 * (created or refreshed); anyone who's lost the tag or gone inactive drops off the *active*
 * roster. Past attendance history is untouched either way — it just stops accumulating.
 * Called opportunistically on Prayer tab load, same pattern as the room's other emit/sync
 * calls (e.g. syncDueTouchpointTasks) — no cron needed for something this small.
 */
export async function syncPrayerVolunteersFromDirectory(): Promise<void> {
  const { data: partners, error: pe } = await supabase
    .from('partners')
    .select('id, name, email, phone, active')
    .or('type.eq.prayer,secondary_types.cs.{prayer}');
  if (pe) throw new Error(pe.message);

  const qualifying = (partners ?? []).filter((p) => p.active);
  if (qualifying.length > 0) {
    const { error: ue } = await supabase.from('prayer_volunteers').upsert(
      qualifying.map((p) => ({
        partner_id: p.id,
        full_name: p.name,
        email: p.email,
        phone: p.phone,
        active: true,
      })),
      { onConflict: 'partner_id' },
    );
    if (ue) throw new Error(ue.message);
  }

  const qualifyingIds = new Set(qualifying.map((p) => p.id));
  const { data: currentRoster, error: re } = await supabase
    .from('prayer_volunteers')
    .select('id, partner_id')
    .eq('active', true)
    .not('partner_id', 'is', null);
  if (re) throw new Error(re.message);

  const toDeactivate = (currentRoster ?? [])
    .filter((v) => v.partner_id && !qualifyingIds.has(v.partner_id))
    .map((v) => v.id);
  if (toDeactivate.length > 0) {
    const { error: de } = await supabase.from('prayer_volunteers').update({ active: false }).in('id', toDeactivate);
    if (de) throw new Error(de.message);
  }
}

// ── Meetings ──────────────────────────────────────────────────────────

export async function fetchMeetingsWithAttendance(): Promise<MeetingWithAttendance[]> {
  const { data: meetings, error: me } = await supabase
    .from('prayer_meetings')
    .select('*')
    .order('meeting_date', { ascending: false })
    .limit(52); // rolling year
  if (me) throw new Error(me.message);
  if (!meetings || meetings.length === 0) return [];

  const ids = meetings.map((m) => m.id);
  const { data: att, error: ae } = await supabase
    .from('prayer_attendance')
    .select('meeting_id, volunteer_id, attended')
    .in('meeting_id', ids);
  if (ae) throw new Error(ae.message);

  return meetings.map((m) => ({
    ...m,
    attendance: (att ?? []).filter((a) => a.meeting_id === m.id),
  })) as MeetingWithAttendance[];
}

export async function logPrayerMeeting(
  meetingDate: string,
  notes: string | null,
  createdBy: string,
  attendance: { volunteer_id: string; attended: boolean }[],
): Promise<void> {
  const { data: meeting, error: me } = await supabase
    .from('prayer_meetings')
    .insert({ meeting_date: meetingDate, notes, created_by: createdBy })
    .select('id')
    .single();
  if (me) throw new Error(me.message);

  if (attendance.length > 0) {
    const rows = attendance.map((a) => ({ meeting_id: meeting.id, ...a }));
    const { error: ae } = await supabase
      .from('prayer_attendance')
      .upsert(rows, { onConflict: 'meeting_id,volunteer_id' });
    if (ae) throw new Error(ae.message);
  }
}

// ── Consecutive missed-month detection ─────────────────────────────────
// The volunteer's commitment is "at least once a month," but meetings are held
// weekly — so a "miss" has to mean a whole calendar month with zero attendance,
// not a single missed weekly meeting. Groups attendance by the meeting's
// YYYY-MM, counting back from the most recent month that actually had a
// meeting, stopping at the first month they attended. A month with no meetings
// logged at all is skipped, not counted as a miss.

export async function consecutiveMissedMonths(volunteerId: string): Promise<number> {
  const { data, error } = await supabase
    .from('prayer_attendance')
    .select('attended, prayer_meetings(meeting_date)')
    .eq('volunteer_id', volunteerId)
    .order('prayer_meetings(meeting_date)', { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);

  const months = new Map<string, boolean>();
  for (const row of data ?? []) {
    const meeting = row.prayer_meetings as unknown as { meeting_date: string } | null;
    const dateStr = meeting?.meeting_date;
    if (!dateStr) continue;
    const monthKey = dateStr.slice(0, 7); // YYYY-MM
    months.set(monthKey, (months.get(monthKey) ?? false) || !!row.attended);
  }

  const orderedMonths = Array.from(months.keys()).sort().reverse();
  let count = 0;
  for (const key of orderedMonths) {
    if (months.get(key)) break;
    count++;
  }
  return count;
}
