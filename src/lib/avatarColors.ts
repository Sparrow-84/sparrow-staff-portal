import type { Profile } from '@/lib/types';

// One entry per staff member so no two people share a color while headcount stays under this length.
// If the team grows past this list, add more entries — colors will otherwise start repeating.
export const AVATAR_COLORS = [
  'bg-sparrow-green',
  'bg-blue-600',
  'bg-purple-600',
  'bg-teal-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-indigo-600',
  'bg-pink-600',
  'bg-cyan-600',
  'bg-orange-600',
  'bg-lime-600',
  'bg-fuchsia-600',
  'bg-sky-600',
  'bg-emerald-700',
];

/** Assigns each person a distinct color, in order of when they joined, so it's stable as people are added. */
export function assignAvatarColors(team: Profile[]): Record<string, string> {
  const byJoinDate = [...team].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const colors: Record<string, string> = {};
  byJoinDate.forEach((member, i) => {
    colors[member.id] = AVATAR_COLORS[i % AVATAR_COLORS.length];
  });
  return colors;
}
