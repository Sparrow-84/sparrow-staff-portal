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

export interface DayGroup {
  key: string;
  label: string;
  items: TaskWithPeople[];
}

/**
 * List view grouping: Overdue pinned first, then Today, then each remaining
 * day of the current week (Mon–Sun) in order — skipping any day with nothing
 * due — then anything further out, then undated tasks. Unlike groupTasks(),
 * this shrinks to nothing once the week's work is done instead of holding a
 * standing "this week / upcoming" bucket.
 */
export function weekListGroups(tasks: TaskWithPeople[], today: string): DayGroup[] {
  const todayD = new Date(today + 'T00:00:00');
  const mondayOffset = (todayD.getDay() + 6) % 7; // days since Monday (0 = Monday)
  const weekStart = new Date(todayD);
  weekStart.setDate(weekStart.getDate() - mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndIso = isoDate(weekEnd);

  const overdue: TaskWithPeople[] = [];
  const todayItems: TaskWithPeople[] = [];
  const byDate = new Map<string, TaskWithPeople[]>();
  const later: TaskWithPeople[] = [];
  const noDate: TaskWithPeople[] = [];

  for (const t of tasks) {
    if (!t.due_date) {
      noDate.push(t);
    } else if (t.due_date < today) {
      overdue.push(t);
    } else if (t.due_date === today) {
      todayItems.push(t);
    } else if (t.due_date <= weekEndIso) {
      const list = byDate.get(t.due_date) ?? [];
      list.push(t);
      byDate.set(t.due_date, list);
    } else {
      later.push(t);
    }
  }

  const groups: DayGroup[] = [];
  if (overdue.length > 0) groups.push({ key: 'overdue', label: 'Overdue', items: overdue });
  if (todayItems.length > 0) groups.push({ key: 'today', label: 'Today', items: todayItems });

  for (const d = new Date(todayD); ; ) {
    d.setDate(d.getDate() + 1);
    const iso = isoDate(d);
    if (iso > weekEndIso) break;
    const items = byDate.get(iso);
    if (items && items.length > 0) {
      groups.push({ key: iso, label: d.toLocaleDateString(undefined, { weekday: 'long' }), items });
    }
  }

  if (later.length > 0) groups.push({ key: 'later', label: 'Upcoming', items: later });
  if (noDate.length > 0) groups.push({ key: 'no_date', label: 'No date', items: noDate });

  return groups;
}

export const PRIORITY_META: Record<Priority, { label: string; dot: string; text: string; pill: string }> = {
  p1: { label: 'P1', dot: 'bg-priority-p1', text: 'text-priority-p1', pill: 'bg-priority-p1/15 text-priority-p1' },
  p2: { label: 'P2', dot: 'bg-priority-p2', text: 'text-priority-p2', pill: 'bg-priority-p2/15 text-priority-p2' },
  p3: { label: 'P3', dot: 'bg-priority-p3', text: 'text-priority-p3', pill: 'bg-priority-p3/15 text-priority-p3' },
  p4: { label: 'P4', dot: 'bg-priority-p4', text: 'text-priority-p4', pill: 'bg-priority-p4/15 text-priority-p4' },
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
