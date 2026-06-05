import type { Priority, PriorityTier, TaskWithPeople } from './types';

export type Bucket = 'overdue' | 'today' | 'this_week' | 'upcoming' | 'no_date';

export const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'no_date', label: 'No date' },
];

/** YYYY-MM-DD for a Date, in local time. */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function bucketFor(dueDate: string | null, done: boolean, today: string): Bucket {
  if (!dueDate) return 'no_date';
  if (dueDate < today) return done ? 'upcoming' : 'overdue';
  if (dueDate === today) return 'today';
  const due = new Date(dueDate + 'T00:00:00');
  const ref = new Date(today + 'T00:00:00');
  const diffDays = Math.round((due.getTime() - ref.getTime()) / 86_400_000);
  return diffDays <= 7 ? 'this_week' : 'upcoming';
}

export function groupTasks(
  tasks: TaskWithPeople[],
  today: string,
): Record<Bucket, TaskWithPeople[]> {
  const groups: Record<Bucket, TaskWithPeople[]> = {
    overdue: [],
    today: [],
    this_week: [],
    upcoming: [],
    no_date: [],
  };
  for (const t of tasks) {
    groups[bucketFor(t.due_date, t.status === 'done', today)].push(t);
  }
  return groups;
}

export const PRIORITY_META: Record<Priority, { label: string; dot: string; text: string }> = {
  p1: { label: 'P1', dot: 'bg-priority-p1', text: 'text-priority-p1' },
  p2: { label: 'P2', dot: 'bg-priority-p2', text: 'text-priority-p2' },
  p3: { label: 'P3', dot: 'bg-priority-p3', text: 'text-priority-p3' },
  p4: { label: 'P4', dot: 'bg-priority-p4', text: 'text-priority-p4' },
};

// ── Three-tier priority overlay (the brief's only priority vocabulary) ──
// 🔴 Before you sleep · 🟡 This week · ⚪ When you get to it. Maps onto the stored
// p1–p4 enum so we keep the existing schema/data: p1→sleep, p2/p3→week, p4→whenever.
export const TIERS: { value: PriorityTier; label: string; emoji: string }[] = [
  { value: 'sleep', label: 'Before you sleep', emoji: '🔴' },
  { value: 'week', label: 'This week', emoji: '🟡' },
  { value: 'whenever', label: 'When you get to it', emoji: '⚪' },
];

export const TIER_META: Record<PriorityTier, { label: string; emoji: string; dot: string; text: string }> = {
  sleep: { label: 'Before you sleep', emoji: '🔴', dot: 'bg-priority-p1', text: 'text-priority-p1' },
  week: { label: 'This week', emoji: '🟡', dot: 'bg-priority-p2', text: 'text-priority-p2' },
  whenever: { label: 'When you get to it', emoji: '⚪', dot: 'bg-priority-p4', text: 'text-priority-p4' },
};

export function tierForPriority(p: Priority): PriorityTier {
  if (p === 'p1') return 'sleep';
  if (p === 'p4') return 'whenever';
  return 'week';
}

export function priorityForTier(t: PriorityTier): Priority {
  if (t === 'sleep') return 'p1';
  if (t === 'whenever') return 'p4';
  return 'p3';
}

/** Friendly relative label for a due date (for task rows). */
export function dueLabel(dueDate: string | null, today: string): string {
  if (!dueDate) return '';
  if (dueDate === today) return 'Today';
  const due = new Date(dueDate + 'T00:00:00');
  const ref = new Date(today + 'T00:00:00');
  const diff = Math.round((due.getTime() - ref.getTime()) / 86_400_000);
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${Math.abs(diff)} days ago`;
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
