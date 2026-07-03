// Operations Room (System 2) — staff-management types.
// Mirrors supabase/migrations/0012_operations.sql. Access tier (ops_access) = Andrew,
// Susanna, Shelly; none of this is ever visible to the staff member it's about — except
// a new hire seeing their own onboarding checklist.

export type DocType = 'job_description' | 'review' | 'offer_letter' | 'onboarding' | 'offboarding' | 'other';
export type IssueStatus = 'open' | 'resolved';
export type ReviewStatus = 'scheduled' | 'completed';
export type ChecklistKind = 'onboarding' | 'offboarding';
export type ChecklistStatus = 'active' | 'complete';

export interface StaffNote {
  id: string;
  staff_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface StaffDocument {
  id: string;
  staff_id: string;
  label: string;
  url: string | null;
  doc_type: DocType;
  created_at: string;
}

export interface Issue {
  id: string;
  staff_id: string;
  author_id: string | null;
  body: string;
  status: IssueStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface Touchpoint {
  id: string;
  staff_id: string;
  met_by: string | null;
  met_on: string;
  note: string | null;
}

export interface Review {
  id: string;
  staff_id: string;
  due_date: string;
  status: ReviewStatus;
  completed_on: string | null;
  reviewer_id: string | null;
  notes: string | null;
}

export interface ChecklistTemplate {
  id: number;
  kind: ChecklistKind;
  step_no: number;
  title: string;
  description: string | null;
  url: string | null;
  estimated_minutes: number | null;
  parent_id: number | null;
}

export interface Checklist {
  id: string;
  staff_id: string;
  kind: ChecklistKind;
  status: ChecklistStatus;
  created_at: string;
  completed_at: string | null;
}

export interface ChecklistStep {
  id: string;
  checklist_id: string;
  step_no: number;
  title: string;
  description: string | null;
  url: string | null;
  estimated_minutes: number | null;
  parent_step_id: string | null;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
}

export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'job_description', label: 'Job description' },
  { value: 'review', label: 'Performance review' },
  { value: 'offer_letter', label: 'Offer letter' },
  { value: 'onboarding', label: 'Onboarding record' },
  { value: 'offboarding', label: 'Offboarding record' },
  { value: 'other', label: 'Other' },
];

export function docTypeLabel(t: DocType): string {
  return DOC_TYPES.find((d) => d.value === t)?.label ?? t;
}

/** Touchpoint health by days since last check-in (blank if none logged, green <30, amber 30–59, red 60+). */
export function touchpointTone(daysSince: number | null): { label: string; chip: string } {
  if (daysSince === null) return { label: '', chip: '' };
  if (daysSince >= 60) return { label: `${daysSince}d ago`, chip: 'bg-priority-p1/15 text-priority-p1' };
  if (daysSince >= 30) return { label: `${daysSince}d ago`, chip: 'bg-priority-p2/15 text-priority-p2' };
  return { label: `${daysSince}d ago`, chip: 'bg-sparrow-green/10 text-sparrow-green' };
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  then.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}
