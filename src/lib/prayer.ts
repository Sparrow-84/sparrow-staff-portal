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

export async function createPrayerVolunteer(input: {
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}): Promise<void> {
  const { error } = await supabase.from('prayer_volunteers').insert(input);
  if (error) throw new Error(error.message);
}

export async function updatePrayerVolunteer(
  id: string,
  patch: Partial<Pick<PrayerVolunteer, 'full_name' | 'email' | 'phone' | 'notes' | 'active'>>,
): Promise<void> {
  const { error } = await supabase.from('prayer_volunteers').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
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

// ── Consecutive miss detection ────────────────────────────────────────
// Returns the number of consecutive meetings a volunteer has missed,
// counting back from the most recent. Returns 0 if attended the last one.

export async function consecutiveMisses(volunteerId: string): Promise<number> {
  const { data, error } = await supabase
    .from('prayer_attendance')
    .select('attended, prayer_meetings(meeting_date)')
    .eq('volunteer_id', volunteerId)
    .order('prayer_meetings(meeting_date)', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);

  let count = 0;
  for (const row of data ?? []) {
    if (!row.attended) {
      count++;
    } else {
      break;
    }
  }
  return count;
}
