// Partnerships Room ("CRM") — types + the stewardship-status derivation.
// Mirrors the schema in supabase/migrations/0008_partnerships.sql and
// 0037_partnerships_schema_v2.sql. The room's organizing idea (from the
// Partnership System Architecture): every relationship needs a named OWNER
// and a CADENCE — a record without a rhythm is the defect the room exists
// to surface.

export type PartnerType =
  | 'donor'
  | 'church'
  | 'community'
  | 'volunteer'
  | 'prayer'
  | 'fst'
  | 'business'
  | 'foundation'
  | 'advisory';
export type PartnerStage = 'prospect' | 'active' | 'lapsed' | 'reengaging' | 'inactive';
export type DonorTier = 'first_time' | 'recurring' | 'major' | 'lapsed';
export type TouchpointMethod = 'email' | 'phone' | 'in_person' | 'text' | 'letter' | 'event' | 'other';
export type GivingMethod = 'Givebutter' | 'Check' | 'Cash' | 'Stock' | 'Other';
export type MouStatus = 'not_needed' | 'needed' | 'on_file';

export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  stage: PartnerStage;
  owner_id: string | null;
  organization: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  donor_tier: DonorTier | null;
  cadence_days: number | null;
  last_touchpoint_at: string | null;
  source: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  // donor-only (0037)
  giving_method: string | null;
  newsletter_subscribed: boolean;
  first_gift_date: string | null;
  // community/church-only (0037)
  sparrow_provides: string | null;
  partner_provides: string | null;
  mou_status: MouStatus | null;
}

export interface Touchpoint {
  id: string;
  partner_id: string;
  logged_by: string | null;
  method: TouchpointMethod;
  occurred_on: string;
  summary: string | null;
  created_at: string;
}

export const PARTNER_TYPE: Record<PartnerType, { label: string; icon: string }> = {
  donor:      { label: 'Donor',            icon: '💛' },
  church:     { label: 'Church partner',   icon: '⛪' },
  community:  { label: 'Community partner', icon: '🤝' },
  volunteer:  { label: 'Volunteer',        icon: '🙌' },
  prayer:     { label: 'Prayer volunteer', icon: '🙏' },
  fst:        { label: 'FST member',       icon: '👪' },
  business:   { label: 'Business partner', icon: '🏢' },
  foundation: { label: 'Foundation',       icon: '🏛️' },
  advisory:   { label: 'Advisory',         icon: '🧭' },
};

export const PARTNER_STAGE: Record<PartnerStage, { label: string; chip: string }> = {
  prospect:   { label: 'Prospect',     chip: 'bg-priority-p3/15 text-priority-p3' },
  active:     { label: 'Active',       chip: 'bg-sparrow-green/10 text-sparrow-green' },
  reengaging: { label: 'Re-engaging',  chip: 'bg-sparrow-gold/20 text-sparrow-ink' },
  lapsed:     { label: 'Lapsed',       chip: 'bg-priority-p1/15 text-priority-p1' },
  inactive:   { label: 'Inactive',     chip: 'bg-sparrow-mist text-sparrow-gray' },
};

export const DONOR_TIER: Record<DonorTier, string> = {
  first_time: 'First-time',
  recurring: 'Recurring',
  major: 'Major ($10k+)',
  lapsed: 'Lapsed',
};

export const TOUCHPOINT_METHOD: Record<TouchpointMethod, string> = {
  email: 'Email',
  phone: 'Phone call',
  in_person: 'In person',
  text: 'Text',
  letter: 'Letter / card',
  event: 'Event',
  other: 'Other',
};

export const MOU_STATUS: Record<MouStatus, string> = {
  not_needed: 'Not needed',
  needed: 'Needed (not on file)',
  on_file: 'On file',
};

export const GIVING_METHODS: GivingMethod[] = ['Givebutter', 'Check', 'Cash', 'Stock', 'Other'];

export const PARTNER_TYPES: PartnerType[] = [
  'donor',
  'church',
  'community',
  'volunteer',
  'prayer',
  'fst',
  'business',
  'foundation',
  'advisory',
];
export const PARTNER_STAGES: PartnerStage[] = ['prospect', 'active', 'reengaging', 'lapsed', 'inactive'];
export const TOUCHPOINT_METHODS: TouchpointMethod[] = [
  'email',
  'phone',
  'in_person',
  'text',
  'letter',
  'event',
  'other',
];

// ── Stewardship status — the derived state that color-codes the room ──
// "Every relationship needs a rhythm, not just a record." A partner is stewarded on time
// (green), coming due (amber), overdue (red), missing a cadence entirely (slate — the
// defect), lapsed, or paused. Computed client-side, like the Twin Oaks rent-cap math.
export type StewardshipStatus = 'on_cadence' | 'due_soon' | 'overdue' | 'no_cadence' | 'lapsed' | 'inactive';

export const STEWARDSHIP: Record<StewardshipStatus, { label: string; dot: string; chip: string }> = {
  on_cadence: { label: 'On cadence',  dot: 'bg-sparrow-green', chip: 'bg-sparrow-green/10 text-sparrow-green' },
  due_soon:   { label: 'Due soon',    dot: 'bg-sparrow-gold',  chip: 'bg-sparrow-gold/20 text-sparrow-ink' },
  overdue:    { label: 'Overdue',     dot: 'bg-priority-p1',   chip: 'bg-priority-p1/15 text-priority-p1' },
  no_cadence: { label: 'No cadence',  dot: 'bg-slate-400',     chip: 'bg-slate-400/15 text-slate-600' },
  lapsed:     { label: 'Lapsed',      dot: 'bg-priority-p1',   chip: 'bg-priority-p1/15 text-priority-p1' },
  inactive:   { label: 'Inactive',    dot: 'bg-sparrow-rule',  chip: 'bg-sparrow-mist text-sparrow-gray' },
};

const DAY_MS = 86_400_000;

/** Days until the next touchpoint is due. null when the partner has no cadence. */
export function daysUntilDue(p: Partner, today: Date = new Date()): number | null {
  if (p.cadence_days == null) return null;
  const anchor = p.last_touchpoint_at ?? p.created_at;
  const due = new Date(anchor).getTime() + p.cadence_days * DAY_MS;
  return Math.floor((due - today.getTime()) / DAY_MS);
}

export function stewardshipStatus(p: Partner, today: Date = new Date()): StewardshipStatus {
  if (!p.active || p.stage === 'inactive') return 'inactive';
  if (p.stage === 'lapsed') return 'lapsed';
  if (p.cadence_days == null) return 'no_cadence';
  const days = daysUntilDue(p, today)!;
  if (days < 0) return 'overdue';
  if (days <= 7) return 'due_soon';
  return 'on_cadence';
}

/** Short human label for when the partner is next due (or how overdue). */
export function dueLabel(p: Partner, today: Date = new Date()): string {
  const days = daysUntilDue(p, today);
  if (days == null) return 'No cadence set';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days <= 7) return `Due in ${days}d`;
  return `Due in ${days}d`;
}

/** Render a stored date (YYYY-MM-DD or ISO) as e.g. "Apr 12". */
export function shortDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
