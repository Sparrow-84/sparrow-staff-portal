export type AppRole = 'admin' | 'manager' | 'staff';
export type Department = 'toc' | 'lcp' | 'partnerships' | 'ops' | 'exec';
export type Priority = 'p1' | 'p2' | 'p3' | 'p4';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  department: Department;
  manager_email: string | null;
  active: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  department: Department;
  priority: Priority;
  status: TaskStatus;
  assignee_id: string;
  created_by: string;
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
