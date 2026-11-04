// Partnerships Room ("CRM") — types + the stewardship-status derivation.
// Taxonomy rebuilt 2026-10-31 (migration 0193): four relationship-based categories down to
// three real ones (donor, community ["Community Partner"], volunteer — archived is a stage,
// not a category), plus a new sub_category describing what kind of entity a record is.
// Church/business/foundation/advisory/fst/prayer/lcp_referral are no longer assignable —
// see the Partnerships SOP for the full reasoning. A record can carry more than one
// category at once via `secondary_types`, same mechanism as before.

export type PartnerType = 'donor' | 'community' | 'volunteer';
export type PartnerSubCategory = 'individual' | 'business' | 'nonprofit' | 'church' | 'prayer';
export type PartnerStage = 'prospect' | 'active' | 'inactive';
export type DonorTier = 'first_time' | 'recurring' | 'major' | 'lapsed';
export type TouchpointMethod = 'email' | 'phone' | 'in_person' | 'text' | 'letter' | 'event' | 'other';
export type GivingMethod = 'Givebutter' | 'Check' | 'Cash' | 'Stock' | 'Other';
export type MouStatus = 'not_needed' | 'needed' | 'on_file';
export type PartnerProvidesTag =
  | 'LCP Participant Referral'
  | 'Volunteers for events'
  | 'In-kind donations'
  | 'Professional services'
  | 'Event sponsorship'
  | 'Speaking or presentation opportunities'
  | 'Prayer Coverage'
  | 'Other';

export interface Donation {
  id: string;
  partner_id: string | null;
  given_by_name: string | null;
  given_by_email: string | null;
  amount_above_10k: boolean;
  designation: string | null;
  giving_method: string | null;
  recurring: boolean;
  received_on: string;
  created_at: string;
  /** Set when partner_id is null and a fuzzy name match was found — waiting on review. */
  possible_match_partner_id: string | null;
}

export interface DonorStat {
  partner_id: string;
  gift_count: number;
  last_gift_date: string | null;
  has_major_gift: boolean;
}

const DONOR_LAPSED_DAYS = 365;

/**
 * Derive the effective donor tier from donation history.
 * 'major' is a one-way ratchet — once set, it stays regardless of recency.
 * For all other tiers, if the last gift was 12+ months ago the tier reads as 'lapsed'
 * so Bethany sees it automatically without manual updates.
 * Returns null when no stat data exists (donations table not yet active).
 */
export function derivedDonorTier(
  stored: DonorTier | null,
  stat: DonorStat | undefined,
  today: Date = new Date(),
): DonorTier | null {
  if (!stat || stat.gift_count === 0) return stored;
  if (stat.has_major_gift || stored === 'major') return 'major';
  if (stat.last_gift_date) {
    const daysSince = Math.floor(
      (today.getTime() - new Date(`${stat.last_gift_date}T12:00:00`).getTime()) / 86_400_000,
    );
    if (daysSince >= DONOR_LAPSED_DAYS) return 'lapsed';
  }
  return stored;
}

export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  /** Extra categories on top of the primary type — e.g. a church that's both a Community
   *  Partner and a Donor. Purely additive: affects tag display + which Directory filter
   *  tabs a partner shows up under. */
  secondary_types: PartnerType[];
  /** What kind of entity this record is. Shared across Donor/Community Partner
   *  (individual/business/nonprofit/church) and Volunteer (prayer is the only option
   *  today). Null only for records predating this field that haven't been touched since. */
  sub_category: PartnerSubCategory | null;
  /** Individuals only (migration 0194) — kept in sync with `name` by the app whenever
   *  either is edited. Null for organizations, and for an individual not yet split
   *  (a genuinely ambiguous record a human hasn't set by hand). */
  first_name: string | null;
  last_name: string | null;
  stage: PartnerStage;
  owner_id: string | null;
  organization: string | null;
  contact_name: string | null;
  // Business-card fields (migration 0181) -- the contact's title/role and org website.
  role: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  donor_tier: DonorTier | null;
  /** The one-off, named, dated item a relationship needs beyond its default coverage —
   *  e.g. "MOU check-in", due 2028-10-01. Mainly relevant to Community Partners; most
   *  Donor/Volunteer records never need this at all. Replaces the old recurring
   *  cadence_days model (migration 0193) — this is a specific real deadline, not a rhythm. */
  needs_additional_touchpoint: boolean;
  additional_touchpoint_label: string | null;
  additional_touchpoint_due: string | null;
  last_touchpoint_at: string | null;
  source: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  // donor-only (0037)
  giving_method: string | null;
  newsletter_subscribed: boolean;
  first_gift_date: string | null;
  // Brevo unsubscribe auto-sync (0179) — set by brevo-webhook, surfaced as a Partnerships
  // Home FYI card until dismissed.
  newsletter_unsubscribed_at: string | null;
  newsletter_unsubscribe_dismissed_at: string | null;
  // community-only (0037)
  sparrow_provides: string | null;
  /** Deprecated (0193) — migrated into `notes` and `partner_provides_tags`. Kept on the type
   *  only so old rows that haven't been re-tagged yet don't silently disappear; don't write
   *  to this going forward. */
  partner_provides: string | null;
  /** What a Community Partner actually contributes — multi-select (migration 0193). */
  partner_provides_tags: PartnerProvidesTag[];
  mou_status: MouStatus | null;
  // Business card photos (migration 0111) — storage paths, not URLs (private bucket).
  business_card_front_path: string | null;
  business_card_back_path: string | null;
  // Custom "touchpoint due" wording (migration 0186) -- for a relationship where the
  // generic reminder doesn't say enough (e.g. The Hive: a casual conversation
  // shouldn't read as "caught up," only an actual stood-up-front-of-church update
  // should). Shown as a second line under the Home due-reminder when set; the
  // due-date math itself is unchanged -- this only changes the wording.
  touchpoint_reminder_note: string | null;
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
  donor:      { label: 'Donor',             icon: '💛' },
  community:  { label: 'Community Partner', icon: '🤝' },
  volunteer:  { label: 'Volunteer',         icon: '🙌' },
};

export const PARTNER_SUB_CATEGORY: Record<PartnerSubCategory, string> = {
  individual: 'Individual',
  business: 'Business',
  nonprofit: 'Nonprofit',
  church: 'Church',
  prayer: 'Prayer',
};

/** Which sub-categories are offered under each top-level category. */
export const SUB_CATEGORIES_FOR_TYPE: Record<PartnerType, PartnerSubCategory[]> = {
  donor: ['individual', 'business', 'nonprofit', 'church'],
  community: ['individual', 'business', 'nonprofit', 'church'],
  volunteer: ['prayer'],
};

export const PARTNER_STAGE: Record<PartnerStage, { label: string; chip: string }> = {
  prospect: { label: 'Prospect', chip: 'bg-priority-p3/15 text-priority-p3' },
  active:   { label: 'Active',   chip: 'bg-sparrow-green/10 text-sparrow-green' },
  inactive: { label: 'Inactive', chip: 'bg-sparrow-mist text-sparrow-gray' },
};

export const DONOR_TIER: Record<DonorTier, string> = {
  first_time: 'First-time',
  recurring: 'Recurring',
  major: 'Major ($10k+)',
  lapsed: 'Stopped giving',
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

// The real, pickable presets -- 'Other' isn't one of these, it's the signal to switch to
// free text instead. A stored value that isn't one of these (and isn't empty) IS that free
// text, e.g. "Donor-Advised Fund" -- not the literal word "Other".
export const GIVING_METHOD_PRESETS = GIVING_METHODS.filter((m) => m !== 'Other');

export function isCustomGivingMethod(value: string | null): boolean {
  return !!value && !(GIVING_METHOD_PRESETS as string[]).includes(value);
}

export const PARTNER_PROVIDES_TAGS: PartnerProvidesTag[] = [
  'LCP Participant Referral',
  'Volunteers for events',
  'In-kind donations',
  'Professional services',
  'Event sponsorship',
  'Speaking or presentation opportunities',
  'Prayer Coverage',
  'Other',
];

export const PARTNER_PROVIDES_PRESETS = PARTNER_PROVIDES_TAGS.filter((t) => t !== 'Other');

export const PARTNER_TYPES: PartnerType[] = ['donor', 'community', 'volunteer'];
export const PARTNER_STAGES: PartnerStage[] = ['prospect', 'active', 'inactive'];
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
// Simplified to 2 colors (migration 0193 / SOP rebuild): most relationships have nothing to
// track at all (TSM + their fixed thank-yous is the complete plan), so there's nothing to
// color. The only thing worth a visual flag is "something needs attention" — an overdue
// named touchpoint, or an unacknowledged Brevo-unsubscribe notice. Inactive records show no
// dot at all; they're already off the active list.
export type StewardshipStatus = 'needs_attention' | 'ok' | 'inactive';

export const STEWARDSHIP: Record<StewardshipStatus, { label: string; dot: string; chip: string }> = {
  needs_attention: { label: 'Needs attention', dot: 'bg-priority-p1',  chip: 'bg-priority-p1/15 text-priority-p1' },
  ok:              { label: 'All good',        dot: 'bg-sparrow-green', chip: 'bg-sparrow-green/10 text-sparrow-green' },
  inactive:        { label: 'Inactive',        dot: '',                chip: 'bg-sparrow-mist text-sparrow-gray' },
};

/** True if a partner is this type either as their primary type or as a secondary tag —
 *  used so a multi-category partner (e.g. donor + community partner) shows up under every
 *  Directory filter tab that applies to them, not just their primary type's tab. */
export function partnerMatchesType(p: Partner, t: PartnerType): boolean {
  return p.type === t || p.secondary_types.includes(t);
}

/** Whether the Partnership terms section (what each side provides + MOU status) applies. */
export function hasPartnershipTerms(p: Partner): boolean {
  return partnerMatchesType(p, 'community');
}

const DAY_MS = 86_400_000;

/** Days until the named additional touchpoint is due. null when the record doesn't need one. */
export function daysUntilDue(p: Partner, today: Date = new Date()): number | null {
  if (!p.needs_additional_touchpoint || !p.additional_touchpoint_due) return null;
  const due = new Date(`${p.additional_touchpoint_due}T12:00:00`).getTime();
  return Math.floor((due - today.getTime()) / DAY_MS);
}

// No computed "time since last contact" overlay — deliberate. A record carries zero
// touchpoint expectation unless needs_additional_touchpoint is explicitly set, so nothing
// should quietly flag it just because logging hasn't happened. Logging a touchpoint ad hoc
// (a call, bumping into someone) is always available but never starts or resets a clock —
// there is no clock. The only things that can mark a record "needs attention" are a named,
// overdue touchpoint someone actually scheduled, or an unacknowledged Brevo unsubscribe.
export function stewardshipStatus(p: Partner, today: Date = new Date()): StewardshipStatus {
  if (!p.active || p.stage === 'inactive') return 'inactive';
  if (p.newsletter_unsubscribed_at
    && (!p.newsletter_unsubscribe_dismissed_at || p.newsletter_unsubscribe_dismissed_at < p.newsletter_unsubscribed_at)) {
    return 'needs_attention';
  }
  const days = daysUntilDue(p, today);
  if (days != null && days < 0) return 'needs_attention';
  return 'ok';
}

/** Short human label for when a record's additional touchpoint is next due (or how overdue).
 *  null when the record doesn't need one at all — most records, by design. */
export function dueLabel(p: Partner, today: Date = new Date()): string | null {
  const days = daysUntilDue(p, today);
  if (days == null) return null;
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days <= 7) return `Due in ${days}d`;
  const due = new Date(`${p.additional_touchpoint_due}T12:00:00`);
  return `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/** Render a stored date (YYYY-MM-DD or ISO) as e.g. "Apr 12".
 *  Date-only strings (YYYY-MM-DD) are parsed at local noon to prevent UTC-midnight
 *  timezone offset from rolling the displayed date back by one day. */
export function shortDate(value: string | null): string {
  if (!value) return '—';
  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  return new Date(normalized).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Recomposes `name` from first/last — called whenever either is edited so `name` (what
 *  every other lookup, dedup check, and task title keys off) stays in sync. */
export function composePartnerName(firstName: string | null, lastName: string | null): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ').trim();
}

/** Whether a record is a person rather than an organization -- sub_category 'individual'
 *  covers Donor/Community Partner; Volunteer has no organization sub-category at all today
 *  (its only option, 'prayer', describes a kind of volunteering, not an entity type), so
 *  every Volunteer record is a person too. */
export function isPersonRecord(p: Pick<Partner, 'type' | 'sub_category'>): boolean {
  return p.sub_category === 'individual' || p.type === 'volunteer';
}

/** "Last, First" for a person with a last name on file; otherwise just `name` —
 *  organizations and not-yet-split people display exactly as before. */
export function displayPartnerName(p: Pick<Partner, 'name' | 'type' | 'sub_category' | 'first_name' | 'last_name'>): string {
  if (isPersonRecord(p) && p.last_name) {
    return p.first_name ? `${p.last_name}, ${p.first_name}` : p.last_name;
  }
  return p.name;
}

// ── Reference descriptions — shown in the help modal and inline in the detail panel ──

export const PARTNER_STAGE_DESC: Record<PartnerStage, string> = {
  prospect: 'An early, unconfirmed relationship — not yet subscribed to TSM. Move to Active once the relationship warrants ongoing stewardship.',
  active:   'A current, healthy relationship that warrants ongoing stewardship. Subscribed to TSM automatically.',
  inactive: 'Archived — moves to the Archived tab. Still receives TSM unless they\'ve unsubscribed. Pick Prospect or Active to restore.',
};

/** Stage is the one control for archiving: Inactive archives the record (moves it to the
 *  Archived tab) and Prospect/Active restores it, so `active` can never disagree with `stage`.
 *  Every stage change in the app goes through this. */
export function stagePatch(stage: PartnerStage): { stage: PartnerStage; active: boolean } {
  return { stage, active: stage !== 'inactive' };
}

export const DONOR_TIER_DESC: Record<DonorTier, string> = {
  first_time: 'Gave for the first time. 72-hr personal follow-up email required.',
  recurring:  'Gives on a regular pattern. No special action beyond normal stewardship.',
  major:      '$10,000+ total giving. Andrew is notified and calls within 72 hrs of this tier being set.',
  lapsed:     'Previously gave but hasn\'t given in 12+ months. This is about giving history, separate from relationship stage.',
};

export const STEWARDSHIP_DESC: Record<StewardshipStatus, string> = {
  needs_attention: 'An overdue touchpoint, or an unacknowledged Brevo-unsubscribe notice. Worth a look.',
  ok: 'Covered — either nothing additional is needed beyond TSM, or the named touchpoint isn\'t due yet.',
  inactive: 'Off the active stewardship list. Still receives the newsletter unless unsubscribed.',
};
