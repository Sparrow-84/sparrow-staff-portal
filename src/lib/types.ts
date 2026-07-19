export type AppRole = 'admin' | 'manager' | 'staff';
export type Department = 'toc' | 'lcp' | 'partnerships' | 'ops' | 'exec';
export type Priority = 'p1' | 'p2' | 'p3' | 'p4';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TriageStatus = 'pending' | 'accepted';

/**
 * The brief's three-tier priority vocabulary ("the only priority levels — simple,
 * no numbers"). It overlays the stored p1–p4 enum so the spine speaks in tiers
 * without a destructive schema change; see tierForPriority/priorityForTier in tasks.ts.
 */
export type PriorityTier = 'sleep' | 'week' | 'whenever';

/** LCP access tier (System 1). null = no LifeChange access. Full = participant PII + notes. */
export type LcpRole = 'full' | 'extended' | null;

/** One chunk of working time — some staff work several of these in a day. */
export interface ScheduleBlock {
  days: string[]; // e.g. ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  start: string;  // '09:00'
  end: string;    // '17:00'
}

export interface WorkSchedule {
  blocks: ScheduleBlock[];
}

export interface OfficeRoom {
  id: string;
  name: string;
  blocks_whole_office: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  department: Department;
  manager_email: string | null;
  active: boolean;
  created_at: string;
  lcp_role: LcpRole;
  /** Full Partnerships Room access independent of department (admins + dept='partnerships' have it implicitly). */
  partnerships_access: boolean;
  /** Operations Room / staff-management access (Andrew, Susanna, Shelly). */
  ops_access: boolean;
  /** Twin Oaks Room explicit access grant — beyond the implicit TOC dept + admin grant. */
  toc_access: boolean;
  /** Stories & Media Room access. */
  stories_access: boolean;
  work_schedule: WorkSchedule | null;
  blurb: string | null;
  photo_url: string | null;
  role_description: string | null;
  push_enabled: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  department: Department;
  priority: Priority;
  status: TaskStatus;
  triage_status: TriageStatus;
  assignee_id: string;
  created_by: string | null; // null = system-generated (emitted by a room)
  source_system: string | null; // 'lcp' | 'crm' | 'toc' | null (created in System 2)
  source_ref: string | null; // room-stable key for dedup, e.g. 'homework:<uuid>'
  label: string | null;
  label_color: string | null;
  recurrence_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

/** A task joined with the names of its assignee and creator (for display). */
export interface TaskWithPeople extends Task {
  assignee: Pick<Profile, 'id' | 'full_name'> | null;
  creator: Pick<Profile, 'id' | 'full_name'> | null;
}

export const DEPARTMENTS: { value: Department; label: string }[] = [
  { value: 'toc', label: 'Twin Oaks' },
  { value: 'lcp', label: 'LifeChange' },
  { value: 'partnerships', label: 'Partnerships' },
  { value: 'ops', label: 'Operations' },
  { value: 'exec', label: 'Executive' },
];

export const ROLES: { value: AppRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'staff', label: 'Staff' },
];

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'p1', label: 'P1 · Urgent' },
  { value: 'p2', label: 'P2 · High' },
  { value: 'p3', label: 'P3 · Normal' },
  { value: 'p4', label: 'P4 · Low' },
];

export function departmentLabel(d: Department): string {
  return DEPARTMENTS.find((x) => x.value === d)?.label ?? d;
}

/** Department colors for calendar pills (color-coded by department, per the brief). */
export const DEPT_PILL: Record<Department, string> = {
  toc: 'bg-sparrow-green text-white',
  lcp: 'bg-blue-600 text-white',
  partnerships: 'bg-purple-600 text-white',
  ops: 'bg-slate-500 text-white',
  exec: 'bg-sparrow-gold text-sparrow-ink',
};
