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

/** Closes any open check-in task for this volunteer (missed-month or post-snooze). */
async function resolvePrayerTasks(volunteerId: string): Promise<void> {
  await supabase.rpc('resolve_system_task', { p_system: 'crm', p_ref: `prayer_miss:${volunteerId}` });
  await supabase.rpc('resolve_system_task', { p_system: 'crm', p_ref: `prayer_snooze_check:${volunteerId}` });
}

/** Snooze from a button (Prayer Team tab or a Home reminder): sets the date and closes any
 *  open check-in task, since the snooze is the answer to it. */
export async function snoozePrayerVolunteer(volunteerId: string, snoozedUntil: string): Promise<void> {
  await updatePrayerVolunteerSnooze(volunteerId, snoozedUntil);
  await resolvePrayerTasks(volunteerId);
}

/** What "Move off prayer team" will do to this volunteer's Directory record. 'archive' when
 *  Prayer is their only role with Sparrow (Volunteer is their only category and Prayer
 *  their only volunteer kind), so no empty record is left cluttering the Directory. */
export type MoveOffEffect = 'archive' | 'keep' | 'no_record';

interface LinkedPartner {
  id: string;
  type: string;
  secondary_types: string[] | null;
  volunteer_sub_categories: string[] | null;
  active: boolean;
}

async function fetchLinkedPartner(partnerId: string): Promise<LinkedPartner | null> {
  const { data, error } = await supabase
    .from('partners')
    .select('id, type, secondary_types, volunteer_sub_categories, active')
    .eq('id', partnerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LinkedPartner | null) ?? null;
}

function moveOffEffectFor(p: LinkedPartner | null): MoveOffEffect {
  if (!p) return 'no_record';
  const categories = new Set([p.type, ...(p.secondary_types ?? [])]);
  const otherKinds = (p.volunteer_sub_categories ?? []).filter((k) => k !== 'prayer');
  const prayerOnly = categories.size === 1 && categories.has('volunteer') && otherKinds.length === 0;
  return prayerOnly ? 'archive' : 'keep';
}

export async function previewMoveOffPrayerTeam(v: Pick<PrayerVolunteer, 'partner_id'>): Promise<MoveOffEffect> {
  return moveOffEffectFor(v.partner_id ? await fetchLinkedPartner(v.partner_id) : null);
}

/**
 * Takes a volunteer off the active prayer roster. Their roster row moves to "No longer
 * active" with its attendance history kept. On the Directory record, Prayer comes off their
 * volunteer kinds; if that was their only role with Sparrow, the record is archived too
 * (same as the Directory's Archive button, so it's restorable from the Archived tab).
 */
export async function moveOffPrayerTeam(v: Pick<PrayerVolunteer, 'id' | 'partner_id'>): Promise<MoveOffEffect> {
  const partner = v.partner_id ? await fetchLinkedPartner(v.partner_id) : null;
  const effect = moveOffEffectFor(partner);
  if (partner) {
    const patch: Record<string, unknown> = {
      volunteer_sub_categories: (partner.volunteer_sub_categories ?? []).filter((k) => k !== 'prayer'),
    };
    if (effect === 'archive') Object.assign(patch, { active: false, stage: 'inactive' });
    const { error } = await supabase.from('partners').update(patch).eq('id', partner.id);
    if (error) throw new Error(error.message);
  }
  const { error: re } = await supabase
    .from('prayer_volunteers')
    .update({ active: false, snoozed_until: null })
    .eq('id', v.id);
  if (re) throw new Error(re.message);
  await resolvePrayerTasks(v.id);
  return effect;
}

/**
 * One door: Directory (partners with the Volunteer → Prayer sub-category) is the only place
 * Bethany manages who's a prayer volunteer. This mirrors that into the roster the meeting
 * attendance log actually points at (migration 0043's prayer_volunteers.partner_id link,
 * previously optional and unused) — every active, Prayer-tagged partner gets a roster row
 * (created or refreshed); anyone who's lost the tag or gone inactive drops off the *active*
 * roster. Past attendance history is untouched either way — it just stops accumulating.
 * Called opportunistically on Prayer tab load, same pattern as the room's other emit/sync
 * calls (e.g. syncDueTouchpointTasks) — no cron needed for something this small — and when
 * the Directory's Volunteer sub-category picker closes.
 *
 * Someone taken off prayer whose record is now an empty Volunteer (no other category, no
 * other volunteer kind) gets their Directory record archived, the same as "Move off prayer
 * team" does, so no empty record is left cluttering the Directory (Susanna, 2026-11-06).
 */
export async function syncPrayerVolunteersFromDirectory(): Promise<void> {
  // "Prayer" is a Volunteer sub-category (migration 0207), on any record that's a Volunteer.
  // The kinds stay on a record when Volunteer is removed (0209), so check the category too.
  const { data: partners, error: pe } = await supabase
    .from('partners')
    .select('id, name, email, phone, active, type, secondary_types')
    .contains('volunteer_sub_categories', ['prayer']);
  if (pe) throw new Error(pe.message);

  const qualifying = (partners ?? []).filter((p) =>
    p.active && (p.type === 'volunteer' || (p.secondary_types ?? []).includes('volunteer')));
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

  const leaving = (currentRoster ?? []).filter((v) => v.partner_id && !qualifyingIds.has(v.partner_id));
  if (leaving.length > 0) {
    const { data: leftPartners, error: lpe } = await supabase
      .from('partners')
      .select('id, type, secondary_types, volunteer_sub_categories, active')
      .in('id', leaving.map((v) => v.partner_id as string));
    if (lpe) throw new Error(lpe.message);
    const toArchive = ((leftPartners ?? []) as LinkedPartner[])
      .filter((p) => p.active && moveOffEffectFor({ ...p, volunteer_sub_categories: [...(p.volunteer_sub_categories ?? []), 'prayer'] }) === 'archive')
      .map((p) => p.id);
    if (toArchive.length > 0) {
      const { error: ae } = await supabase.from('partners').update({ active: false, stage: 'inactive' }).in('id', toArchive);
      if (ae) throw new Error(ae.message);
    }
    const { error: de } = await supabase
      .from('prayer_volunteers')
      .update({ active: false, snoozed_until: null })
      .in('id', leaving.map((v) => v.id));
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
// logged at all is skipped, not counted as a miss. A month that had meetings
// but none tracking this volunteer means they were off the roster then — the
// count stops there too, so someone rejoining starts fresh instead of
// inheriting the missed months from before they left.

export async function consecutiveMissedMonths(volunteerId: string): Promise<number> {
  const [{ data, error }, { data: meetings, error: me }] = await Promise.all([
    supabase
      .from('prayer_attendance')
      .select('attended, prayer_meetings(meeting_date)')
      .eq('volunteer_id', volunteerId)
      .order('prayer_meetings(meeting_date)', { ascending: false })
      .limit(60),
    supabase
      .from('prayer_meetings')
      .select('meeting_date')
      .order('meeting_date', { ascending: false })
      .limit(60),
  ]);
  if (error) throw new Error(error.message);
  if (me) throw new Error(me.message);

  const months = new Map<string, boolean>();
  for (const row of data ?? []) {
    const meeting = row.prayer_meetings as unknown as { meeting_date: string } | null;
    const dateStr = meeting?.meeting_date;
    if (!dateStr) continue;
    const monthKey = dateStr.slice(0, 7); // YYYY-MM
    months.set(monthKey, (months.get(monthKey) ?? false) || !!row.attended);
  }

  const meetingMonths = Array.from(new Set((meetings ?? []).map((m) => m.meeting_date.slice(0, 7))))
    .sort()
    .reverse();
  let count = 0;
  for (const key of meetingMonths) {
    if (!months.has(key)) break; // not on the roster that month
    if (months.get(key)) break;
    count++;
  }
  return count;
}

/** For volunteers back on the active roster after time off it: volunteer id → the date of
 *  the last meeting they were tracked at, i.e. roughly when they stepped away. Leaves out
 *  anyone tracked at the latest logged meeting, and anyone with no history (brand new).
 *  Reads their full history, not just the loaded year, since a gap over a year is exactly
 *  the case that matters (they sign the agreement again). */
export async function fetchReturningSince(volunteerIds: string[]): Promise<Record<string, string>> {
  const { latestDate, lastTracked } = await fetchLastTracked(volunteerIds);
  if (!latestDate) return {};
  return Object.fromEntries(Object.entries(lastTracked).filter(([, date]) => date < latestDate));
}

/** Volunteer id → the date of the last meeting they were tracked at (on the roster for),
 *  plus the latest meeting logged at all. Full history, not just the loaded year. */
export async function fetchLastTracked(
  volunteerIds: string[],
): Promise<{ latestDate: string | null; lastTracked: Record<string, string> }> {
  if (volunteerIds.length === 0) return { latestDate: null, lastTracked: {} };
  const [{ data: latest, error: le }, { data: rows, error: re }] = await Promise.all([
    supabase.from('prayer_meetings').select('meeting_date').order('meeting_date', { ascending: false }).limit(1),
    supabase
      .from('prayer_attendance')
      .select('volunteer_id, prayer_meetings(meeting_date)')
      .in('volunteer_id', volunteerIds),
  ]);
  if (le) throw new Error(le.message);
  if (re) throw new Error(re.message);
  const latestDate = latest?.[0]?.meeting_date as string | undefined;
  if (!latestDate) return { latestDate: null, lastTracked: {} };

  const lastTracked: Record<string, string> = {};
  for (const row of rows ?? []) {
    const date = (row.prayer_meetings as unknown as { meeting_date: string } | null)?.meeting_date;
    if (date && (!lastTracked[row.volunteer_id] || date > lastTracked[row.volunteer_id])) {
      lastTracked[row.volunteer_id] = date;
    }
  }
  return { latestDate, lastTracked };
}
