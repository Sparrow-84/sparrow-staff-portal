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

export type GrantStatus = 'active' | 'past';

export interface Grant {
  id: string;
  funder_name: string;
  amount: number | null;
  placed_in_service_date: string | null;
  affordability_period_end: string | null;
  certification_due_date: string | null;
  last_certified_on: string | null;
  prior_consent_required: boolean;
  notes: string | null;
  status: GrantStatus;
  owner_id: string | null;
  lead_time_days: number;
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

export interface GrantLink {
  id: string;
  grant_id: string;
  label: string;
  url: string;
  created_by: string | null;
  created_at: string;
}

export interface GrantDocument {
  id: string;
  grant_id: string;
  label: string;
  storage_path: string;
  summary: string | null;
  created_by: string | null;
  created_at: string;
}

/** An append-only timeline entry on an Active Grant — same shape and purpose as
 * GrantProspectUpdate. When a Prospect is awarded, its own Updates log is carried
 * forward here automatically (see mark_prospect_awarded() in 0214_grant_updates.sql)
 * so the history survives the conversion rather than being stranded on a prospect
 * record the UI no longer surfaces. */
export interface GrantUpdate {
  id: string;
  grant_id: string;
  body: string;
  milestone: string | null;
  created_by: string | null;
  created_at: string;
}

/** A named contact for this grant — funder staff, a warm intro, a board connection,
 * etc. Kept independent of grant status so info isn't lost if a grant moves between
 * stages (and, for prospects, carried forward automatically if one is later awarded —
 * see grant_prospect_contacts_carry_forward in 0171_grant_contacts.sql). */
export interface GrantContact {
  id: string;
  grant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

/** Parses a date the way people mean it. A bare "YYYY-MM-DD" (a Postgres `date` column)
 * is a calendar day, not an instant — `new Date("2026-09-11")` reads it as UTC midnight,
 * which in Pacific time is the evening of Sept 10, so every date showed a day early.
 * Full timestamps (created_at etc.) still go through the normal parser. */
function parseDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
}

/** A calendar day ("2026-09-11") → a timestamp at local noon, for Updates entries whose
 * created_at should be the day something HAPPENED (applied, awarded), not the day it was
 * typed in. Noon keeps it on the right day in any US timezone. */
export function dayToTimestamp(day: string): string {
  const d = parseDate(day);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

/** A timestamp → its local calendar day ("2026-09-11"), for a date input. */
export function timestampToDay(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Days since (positive) or until (negative) a due date. Same math as ops-types.daysSince. */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = parseDate(iso);
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
  return parseDate(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
