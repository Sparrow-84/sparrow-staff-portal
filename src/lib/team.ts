import { supabase } from './supabase';
import type { Profile, WorkSchedule } from './types';

export async function fetchTeamProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('active', true)
    .order('full_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

/** Current events happening right now (for "in meeting" availability dots). */
export async function fetchCurrentEvents(): Promise<{ department: string | null; created_by: string | null }[]> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('calendar_events')
    .select('department, created_by')
    .lte('starts_at', now)
    .gte('ends_at', now)
    .eq('is_personal', false);
  return (data ?? []) as { department: string | null; created_by: string | null }[];
}

export async function updateMyProfile(
  id: string,
  patch: { blurb?: string | null; work_schedule?: WorkSchedule | null },
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type AvailabilityStatus = 'available' | 'in_meeting' | 'off' | 'unknown';

export function getAvailability(
  profile: Profile,
  currentEvents: { department: string | null; created_by: string | null }[],
): AvailabilityStatus {
  const schedule = profile.work_schedule;
  if (!schedule) return 'unknown';

  const now = new Date();
  const todayName = DAYS_SHORT[now.getDay()];
  if (!schedule.days.includes(todayName)) return 'off';

  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (nowTime < schedule.start || nowTime > schedule.end) return 'off';

  const inMeeting = currentEvents.some(
    (ev) => ev.department === profile.department || ev.department === null,
  );
  return inMeeting ? 'in_meeting' : 'available';
}
