// Grant Tracking module (Operations room, 4th tab) — types.
// Mirrors supabase/migrations/0078_grants.sql. Access tier (ops_access) = Andrew,
// Susanna, Shelly — same gate as the rest of Operations. Susanna's domain; tracked
// separately from Partnerships/CRM donor & partner relationships.
//
// The 4 notification categories are the standard funder-notification triggers for
// long-term affordability-period grants — notices sent TO the funder about changes
// at the property (insurance, management, ownership/transfer, new debt), not
// Sparrow's own insurance shopping.

export type GrantNotificationCategory =
  | 'insurance_change'
  | 'management_change'
  | 'ownership_transfer'
  | 'debt';

export const GRANT_NOTIFICATION_CATEGORIES: { value: GrantNotificationCategory; label: string }[] = [
  { value: 'insurance_change', label: 'Insurance change' },
  { value: 'management_change', label: 'Management change' },
  { value: 'ownership_transfer', label: 'Ownership / transfer' },
  { value: 'debt', label: 'Debt' },
];

export function notificationCategoryLabel(c: GrantNotificationCategory): string {
  return GRANT_NOTIFICATION_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

export interface Grant {
  id: string;
  funder_name: string;
  amount: number | null;
  placed_in_service_date: string | null;
  affordability_period_end: string | null;
  ohcs_contact_name: string | null;
  ohcs_contact_email: string | null;
  ohcs_contact_phone: string | null;
  certification_due_date: string | null;
  last_certified_on: string | null;
  prior_consent_required: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GrantNotification {
  id: string;
  grant_id: string;
  category: GrantNotificationCategory;
  sent_on: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface GrantDocument {
  id: string;
  grant_id: string;
  label: string;
  storage_path: string;
  created_by: string | null;
  created_at: string;
}

/** Days since (positive) or until (negative) a due date. Same math as ops-types.daysSince. */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  then.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

/** Certification due-date health: overdue (red) if past due, upcoming (amber) within 60
 * days, fine (green) otherwise, blank if no due date is set. */
export function certificationTone(dueDateIso: string | null): { label: string; chip: string } {
  const d = daysSince(dueDateIso);
  if (d === null) return { label: '', chip: '' };
  if (d > 0) return { label: `${d}d overdue`, chip: 'bg-priority-p1/15 text-priority-p1' };
  if (d >= -60) return { label: `Due in ${-d}d`, chip: 'bg-priority-p2/15 text-priority-p2' };
  return { label: `Due in ${-d}d`, chip: 'bg-sparrow-green/10 text-sparrow-green' };
}

export function formatMoney(amount: number | null): string {
  if (amount === null) return '—';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Plain date-with-year display (grant dates often run decades out, so relative
 * "Today/Tomorrow" labels like lcp-format's dayLabel aren't useful here). */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
