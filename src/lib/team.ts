import { supabase } from './supabase';
import type { Profile, ScheduleBlock, WorkSchedule } from './types';

/** Reads schedules saved before the multi-block format; wraps the old single {days,start,end} shape into one block. */
export function normalizeSchedule(schedule: WorkSchedule | (ScheduleBlock & { blocks?: undefined }) | null): ScheduleBlock[] {
  if (!schedule) return [];
  if (Array.isArray((schedule as WorkSchedule).blocks)) return (schedule as WorkSchedule).blocks;
  const legacy = schedule as ScheduleBlock;
  return legacy.days ? [{ days: legacy.days, start: legacy.start, end: legacy.end }] : [];
}

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
  patch: { blurb?: string | null; work_schedule?: WorkSchedule | null; photo_url?: string | null; push_enabled?: boolean },
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function uploadAvatarPhoto(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${userId}.${ext}`;
  const { error } = await supabase.storage.from('staff-avatars').upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('staff-avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type AvailabilityStatus = 'available' | 'in_meeting' | 'off' | 'unknown';

export function getAvailability(
  profile: Profile,
  currentEvents: { department: string | null; created_by: string | null }[],
): AvailabilityStatus {
  const blocks = normalizeSchedule(profile.work_schedule);
  if (blocks.length === 0) return 'unknown';

  const now = new Date();
  const todayName = DAYS_SHORT[now.getDay()];
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const inCurrentBlock = blocks.some(
    (b) => b.days.includes(todayName) && nowTime >= b.start && nowTime <= b.end,
  );
  if (!inCurrentBlock) return 'off';

  const inMeeting = currentEvents.some(
    (ev) => ev.department === profile.department || ev.department === null,
  );
  return inMeeting ? 'in_meeting' : 'available';
}
