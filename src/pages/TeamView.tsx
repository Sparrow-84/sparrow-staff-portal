import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchTeamProfiles, fetchCurrentEvents, getAvailability, type AvailabilityStatus } from '@/lib/team';
import { departmentLabel } from '@/lib/types';
import type { Profile } from '@/lib/types';

const AVATAR_COLORS = [
  'bg-sparrow-green',
  'bg-blue-600',
  'bg-purple-600',
  'bg-teal-600',
  'bg-amber-600',
  'bg-rose-600',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const DOT_CONFIG: Record<AvailabilityStatus, { color: string; label: string }> = {
  available:  { color: 'bg-emerald-500', label: 'Available' },
  in_meeting: { color: 'bg-amber-400',   label: 'In a meeting' },
  off:        { color: 'bg-slate-300',   label: 'Off right now' },
  unknown:    { color: 'bg-slate-200',   label: 'Schedule not set' },
};

function AvailabilityDot({ status }: { status: AvailabilityStatus }) {
  const { color, label } = DOT_CONFIG[status];
  return (
    <span className="group relative flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-xs text-sparrow-gray">{label}</span>
    </span>
  );
}

function scheduleText(schedule: Profile['work_schedule']): string {
  if (!schedule) return '';
  const days = schedule.days.join(' · ');
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const suffix = h >= 12 ? 'pm' : 'am';
    const hour = h % 12 || 12;
    return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, '0')}${suffix}`;
  };
  return `${days}  ${fmt(schedule.start)}–${fmt(schedule.end)}`;
}

function StaffCard({
  staff,
  status,
  isMe,
}: {
  staff: Profile;
  status: AvailabilityStatus;
  isMe: boolean;
}) {
  return (
    <div className={`flex gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card ${isMe ? 'ring-1 ring-sparrow-green/30' : ''}`}>
      {/* Avatar */}
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor(staff.full_name)}`}>
        {initials(staff.full_name)}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <p className="font-medium text-sparrow-ink">{staff.full_name}</p>
          {isMe && <span className="text-xs text-sparrow-gray">(you)</span>}
        </div>

        {staff.role_description && (
          <p className="mt-0.5 text-sm text-sparrow-gray">{staff.role_description}</p>
        )}

        {staff.blurb && (
          <p className="mt-1.5 text-sm text-sparrow-ink/80 italic">&ldquo;{staff.blurb}&rdquo;</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <AvailabilityDot status={status} />
          {staff.work_schedule && (
            <span className="text-xs text-sparrow-gray">{scheduleText(staff.work_schedule)}</span>
          )}
        </div>

        <p className="mt-1 text-xs text-sparrow-gray/70">{departmentLabel(staff.department)}</p>
      </div>
    </div>
  );
}

export function TeamView() {
  const { profile } = useAuth();
  const [team, setTeam] = useState<Profile[]>([]);
  const [currentEvents, setCurrentEvents] = useState<{ department: string | null; created_by: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([fetchTeamProfiles(), fetchCurrentEvents()])
      .then(([profiles, events]) => {
        setTeam(profiles);
        setCurrentEvents(events);
      })
      .finally(() => setLoading(false));
  }, []);

  // Refresh the "in meeting" dot every 5 minutes without a full reload
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchCurrentEvents().then(setCurrentEvents);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!profile) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold">Team</h1>
        <p className="mt-1 text-sm text-sparrow-gray">
          Who's on the team, what they do, and when they're typically working.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-sparrow-gray">Loading…</p>
      ) : (
        <div className="space-y-3">
          {team.map((member) => (
            <StaffCard
              key={member.id}
              staff={member}
              status={getAvailability(member, currentEvents)}
              isMe={member.id === profile.id}
            />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-sparrow-gray">
        Update your own schedule and blurb in{' '}
        <span className="font-medium text-sparrow-ink">Settings → My Profile</span>.
      </p>
    </div>
  );
}
