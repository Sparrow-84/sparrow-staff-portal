import { supabase } from './supabase';
import { localDate, localDateOf } from './date';

// ─── Types ────────────────────────────────────────────────────────────

export type CommType =
  | 'tsm'
  | 'tsm_easter'
  | 'tsm_midyear'
  | 'tsm_christmas'
  | 'sparrow_spotlight'
  | 'annual_report'
  | 'giving_tuesday'
  | 'christmas_cards';

export type CommStatus = 'not_started' | 'in_progress' | 'sent';
export type SocialPlatform = 'facebook' | 'instagram' | 'both';
export type SocialStatus = 'planned' | 'scheduled' | 'posted';

export interface PartnershipComm {
  id: string;
  year: number;
  comm_type: CommType;
  title: string;
  publish_date: string;
  status: CommStatus;
  is_financial_ask: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnershipCollateral {
  id: string;
  item_name: string;
  qty_on_hand: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  /** Who is responsible for this item's review. */
  owner_id: string;
  /** Date this item was last reviewed. */
  last_reviewed_at: string;
  /** When it's next due for review (migration 0211). It comes up on Home and in the owner's
   *  tasks two weeks before. Before 0211 runs it's derived from the old cadence on fetch. */
  next_review_at: string;
  /** Link to the editable source file or its folder (migration 0211). */
  link: string | null;
}

export interface PartnershipSocialPost {
  id: string;
  platform: SocialPlatform;
  content_idea: string;
  planned_date: string | null;
  status: SocialStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnershipEvent {
  id: string;
  event_name: string;
  event_date: string;
  location: string | null;
  attendees: string | null;
  notes: string | null;
  created_at: string;
}

// Room-wide cadence/lead-time/owner settings for the two reminders with no natural row of
// their own (migration 0080) — social posting and the newsletter/comms calendar.
export type RecurringSettingKind = 'social_post' | 'newsletter';

export interface PartnershipRecurringSetting {
  id: string;
  kind: RecurringSettingKind;
  cadence_days: number;
  lead_time_days: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectionNote {
  id: string;
  connection_id: string;
  occurred_on: string;
  note: string;
  logged_by: string | null;
  created_at: string;
}

export interface PartnershipConnection {
  id: string;
  event_id: string | null;
  name: string;
  organization: string | null;
  // Business-card fields (migration 0181) — carried over to the partner record if this
  // connection becomes a partner (see AddPartnerPanel's initialValues).
  role: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  what_discussed: string | null;
  next_action: string | null;
  followup_due: string | null;
  followup_done: boolean;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  // Business card photos (migration 0111) — storage paths, not URLs (private bucket).
  business_card_front_path: string | null;
  business_card_back_path: string | null;
  // Migration 0200 -- undefined until it runs.
  archived_at?: string | null;
  archived_by?: string | null;
  /** The Directory record this connection was moved to, if any. */
  converted_to_partner_id?: string | null;
}

// ─── Comms ────────────────────────────────────────────────────────────

export async function fetchComms(year: number): Promise<PartnershipComm[]> {
  const { data, error } = await supabase
    .from('partnership_comms')
    .select('*')
    .eq('year', year)
    .order('publish_date');
  if (error) throw new Error(error.message);
  return (data ?? []) as PartnershipComm[];
}

/** Returns the Nth Thursday of the given month (0-indexed month, 1-indexed n). */
function nthThursday(year: number, month: number, n: number): Date {
  const d = new Date(year, month, 1);
  const firstThursday = 1 + ((4 - d.getDay() + 7) % 7);
  return new Date(year, month, firstThursday + (n - 1) * 7);
}

// Fixed-date federal holidays that could ever land on a Thursday in these calculations.
// Floating "Nth Monday" holidays (MLK, Presidents, Memorial, Labor, Columbus) can never
// fall on a Thursday, so they're deliberately left out.
const FIXED_HOLIDAYS: [month: number, day: number][] = [
  [0, 1],   // New Year's Day
  [5, 19],  // Juneteenth
  [6, 4],   // Independence Day
  [10, 11], // Veterans Day
  [11, 25], // Christmas Day
];

/** Thanksgiving is defined as the 4th Thursday of November, so any date that IS the 4th
 *  Thursday of November is Thanksgiving by definition -- no separate lookup needed. */
function isHoliday(d: Date): boolean {
  if (d.getDay() === 4 && d.getMonth() === 10 && d.getDate() >= 22 && d.getDate() <= 28) return true;
  return FIXED_HOLIDAYS.some(([m, day]) => d.getMonth() === m && d.getDate() === day);
}

/** The Nth Thursday of the month, moved 2 days earlier (to the Tuesday of that week) if it
 *  lands on a recognized holiday -- TSM and Sparrow Spotlight both follow this rule. */
function holidayAdjustedNthThursday(year: number, month: number, n: number): Date {
  const thursday = nthThursday(year, month, n);
  if (!isHoliday(thursday)) return thursday;
  const shifted = new Date(thursday);
  shifted.setDate(shifted.getDate() - 2);
  return shifted;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function buildCommsForYear(year: number): Omit<PartnershipComm, 'id' | 'created_at' | 'updated_at'>[] {
  // Giving Tuesday is always the Tuesday right after the 4th Thursday of November
  // (Thanksgiving) -- not holiday-shifted itself, since it's defined relative to the
  // holiday, not independently colliding with it.
  const thanksgiving = nthThursday(year, 10, 4);
  const givingTuesday = new Date(thanksgiving);
  givingTuesday.setDate(givingTuesday.getDate() + 5);

  const januaryTsmDate = toISO(holidayAdjustedNthThursday(year, 0, 2));

  // TSM: always the 2nd Thursday of the month. Sparrow Spotlight: always the 4th Thursday.
  // Both move 2 days earlier (to that week's Tuesday) if they'd otherwise land on a
  // recognized holiday -- Susanna's rule, so November Spotlight (which would always hit
  // Thanksgiving, by definition the 4th Thursday of November) lands 2 days before it instead.
  const spotlightComms: Omit<PartnershipComm, 'id' | 'created_at' | 'updated_at'>[] = MONTH_NAMES.map((name, m) => ({
    year, comm_type: 'sparrow_spotlight' as const, title: `The Sparrow Spotlight — ${name}`,
    publish_date: toISO(holidayAdjustedNthThursday(year, m, 4)), status: 'not_started' as const, is_financial_ask: false, notes: null,
  }));

  return [
    ...spotlightComms,
    {
      // Two weeks after the January TSM edition, so the two never collide and the Annual
      // Report always has its own clear week -- not a fixed calendar date (was hardcoded
      // to Jan 15 before, which drifted out of sync with where January TSM actually landed
      // most years).
      year, comm_type: 'annual_report', title: 'Annual Report',
      publish_date: addDaysISO(januaryTsmDate, 14), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — January',
      publish_date: januaryTsmDate, status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — February',
      publish_date: toISO(holidayAdjustedNthThursday(year, 1, 2)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — March',
      publish_date: toISO(holidayAdjustedNthThursday(year, 2, 2)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm_easter', title: 'TSM — Easter Edition',
      publish_date: toISO(holidayAdjustedNthThursday(year, 3, 2)), status: 'not_started', is_financial_ask: true, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — May',
      publish_date: toISO(holidayAdjustedNthThursday(year, 4, 2)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm_midyear', title: 'TSM — Mid-Year Edition',
      publish_date: toISO(holidayAdjustedNthThursday(year, 5, 2)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — July',
      publish_date: toISO(holidayAdjustedNthThursday(year, 6, 2)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — August',
      publish_date: toISO(holidayAdjustedNthThursday(year, 7, 2)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — September',
      publish_date: toISO(holidayAdjustedNthThursday(year, 8, 2)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — October',
      publish_date: toISO(holidayAdjustedNthThursday(year, 9, 2)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — November',
      publish_date: toISO(holidayAdjustedNthThursday(year, 10, 2)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'giving_tuesday', title: 'Giving Tuesday',
      publish_date: toISO(givingTuesday), status: 'not_started', is_financial_ask: true, notes: null,
    },
    {
      year, comm_type: 'tsm_christmas', title: 'TSM — Christmas/EOY Edition',
      publish_date: toISO(holidayAdjustedNthThursday(year, 11, 2)), status: 'not_started', is_financial_ask: true, notes: null,
    },
    {
      year, comm_type: 'christmas_cards', title: 'Physical Christmas Cards',
      publish_date: `${year}-12-15`, status: 'not_started', is_financial_ask: false, notes: null,
    },
  ];
}

/** Insert the full year's comms entries if none exist for that year. */
export async function seedCommsForYear(year: number): Promise<void> {
  const { count, error: countErr } = await supabase
    .from('partnership_comms')
    .select('id', { count: 'exact', head: true })
    .eq('year', year);
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) > 0) return;

  const rows = buildCommsForYear(year);
  const { error } = await supabase.from('partnership_comms').insert(rows);
  if (error) throw new Error(error.message);
}

export async function updateCommStatus(id: string, status: CommStatus): Promise<void> {
  const { error } = await supabase
    .from('partnership_comms')
    .update({ status })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateCommNotes(id: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from('partnership_comms')
    .update({ notes })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── TSM production milestones (migration 0110) ────────────────────────
// Partnerships staff can add, remove, and reassign milestones freely -- the fixed template
// below just auto-fills a sensible starting checklist for TSM and Spotlight issues, since
// those repeat every month. One-off pieces (Annual Report, Giving Tuesday, Christmas Cards,
// or anything new) start with no milestones at all; staff build their own checklist for
// those using the same Add/Delete controls, as far in advance as the piece needs.

export interface PartnershipCommsMilestone {
  id: string;
  comm_id: string;
  label: string;
  due_date: string;
  owner_id: string | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
}

// Sparrow Spotlight runs on the same 6-step cadence as that month's TSM issue, submitted
// to and returned from the Partnerships Manager on the same days -- its milestones are
// seeded against that month's TSM publish date (see referenceDateForMilestones), not its
// own later publish date, even though the Spotlight piece itself goes out roughly two
// weeks after.
const MILESTONE_TEMPLATE: { label: string; offsetDays: number }[] = [
  { label: 'Contributor content due (LCP staff)', offsetDays: -10 },
  { label: 'Draft 1 → Partnerships Manager', offsetDays: -7 },
  { label: 'Partnerships Manager notes back', offsetDays: -5 },
  { label: 'Draft 2 → Partnerships Manager', offsetDays: -3 },
  { label: 'Partnerships Manager notes back', offsetDays: -1 },
  { label: 'Final draft → Publish', offsetDays: 0 },
];

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function fetchMilestones(commIds: string[]): Promise<PartnershipCommsMilestone[]> {
  if (commIds.length === 0) return [];
  const { data, error } = await supabase
    .from('partnership_comms_milestones')
    .select('*')
    .in('comm_id', commIds)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as PartnershipCommsMilestone[];
}

/** Does this comm type get an auto-filled starting checklist? (TSM/Spotlight only -- every
 *  other comm type starts with zero milestones; staff add their own as needed.) */
export function hasMilestoneTemplate(commType: CommType): boolean {
  return commType.startsWith('tsm') || commType === 'sparrow_spotlight';
}

/** Sparrow Spotlight's milestones are seeded against that same month's TSM publish date
 *  (not Spotlight's own, later publish date), so both land on the Partnerships Manager's
 *  desk the same day. Spotlight's publish_date month never crosses a month boundary from its
 *  holiday shift (the 4th Thursday is always day 22-28, -2 days keeps it day 20+), so
 *  reading the month back off its own publish_date is safe. */
function referenceDateForMilestones(comm: PartnershipComm): string {
  if (comm.comm_type !== 'sparrow_spotlight') return comm.publish_date;
  const month = new Date(comm.publish_date + 'T00:00:00').getMonth();
  return toISO(holidayAdjustedNthThursday(comm.year, month, 2));
}

/**
 * Seeds the default production milestones for any TSM or Sparrow Spotlight comm that
 * doesn't have them yet, defaulting every one to defaultOwnerId (Bethany) — she reassigns
 * individual ones (e.g. to the Partnerships Manager, or back to Unassigned for "Contributor
 * content due") afterward, or adds/removes milestones entirely via createMilestone/
 * deleteMilestone. Comm types with no template (Annual Report, Giving Tuesday, Christmas
 * Cards, anything new) are left alone here -- staff build their checklist from scratch.
 */
export async function seedMilestonesForComms(comms: PartnershipComm[], defaultOwnerId: string | null): Promise<void> {
  const milestoneComms = comms.filter((c) => hasMilestoneTemplate(c.comm_type));
  if (milestoneComms.length === 0) return;
  const { data: existing, error } = await supabase
    .from('partnership_comms_milestones')
    .select('comm_id')
    .in('comm_id', milestoneComms.map((c) => c.id));
  if (error) throw new Error(error.message);
  const seededCommIds = new Set((existing ?? []).map((r) => r.comm_id as string));

  const rows: Omit<PartnershipCommsMilestone, 'id' | 'created_at' | 'completed_at'>[] = [];
  for (const comm of milestoneComms) {
    if (seededCommIds.has(comm.id)) continue;
    const referenceDate = referenceDateForMilestones(comm);
    MILESTONE_TEMPLATE.forEach((m, i) => {
      rows.push({
        comm_id: comm.id,
        label: m.label,
        due_date: addDaysISO(referenceDate, m.offsetDays),
        owner_id: defaultOwnerId,
        sort_order: i,
      });
    });
  }
  if (rows.length === 0) return;
  const { error: insErr } = await supabase.from('partnership_comms_milestones').insert(rows);
  if (insErr) throw new Error(insErr.message);
}

/** Adds a staff-created milestone to any comm's checklist -- used both to build a from-
 *  scratch checklist for one-off pieces (Annual Report, Giving Tuesday, etc.) and to add
 *  an extra step to a TSM/Spotlight issue that needs one. */
export async function createMilestone(
  commId: string,
  label: string,
  dueDate: string,
  ownerId: string | null,
  sortOrder: number,
): Promise<PartnershipCommsMilestone> {
  const { data, error } = await supabase
    .from('partnership_comms_milestones')
    .insert({ comm_id: commId, label, due_date: dueDate, owner_id: ownerId, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PartnershipCommsMilestone;
}

export async function deleteMilestone(id: string): Promise<void> {
  const { error } = await supabase.from('partnership_comms_milestones').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateMilestone(
  id: string,
  patch: Partial<Pick<PartnershipCommsMilestone, 'due_date' | 'owner_id' | 'completed_at'>>,
): Promise<void> {
  const { error } = await supabase.from('partnership_comms_milestones').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function syncCommsMilestoneTasks(): Promise<number> {
  const { data, error } = await supabase.rpc('emit_comms_milestone_tasks');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

// ─── Collateral ───────────────────────────────────────────────────────

/** Days ahead of its Next review date that an item comes up on Home and in the owner's
 *  tasks. Same number as emit_collateral_review_tasks() (migration 0211). */
export const COLLATERAL_HEADS_UP_DAYS = 14;

/** The suggested next review after one is done: six months out (same as migration 0211's
 *  rule for a review task finished outside this tab). */
export function defaultNextCollateralReview(from: string = localDate()): string {
  const d = new Date(`${from}T12:00:00`);
  d.setMonth(d.getMonth() + 6);
  return localDateOf(d);
}

type CollateralRow = Omit<PartnershipCollateral, 'next_review_at' | 'link'> & {
  next_review_at?: string | null;
  link?: string | null;
  cadence_days?: number | null;
};

/** Before migration 0211 runs there's no next_review_at/link column: derive the date from
 *  the old cadence so the tab and Home still read correctly. */
export function toCollateral<T extends Pick<CollateralRow, 'last_reviewed_at' | 'next_review_at' | 'link' | 'cadence_days'>>(
  r: T,
): T & Pick<PartnershipCollateral, 'next_review_at' | 'link'> {
  let next = r.next_review_at ?? null;
  if (!next) {
    const d = new Date(`${r.last_reviewed_at}T12:00:00`);
    d.setDate(d.getDate() + (r.cadence_days ?? 182));
    next = localDateOf(d);
  }
  return { ...r, next_review_at: next, link: r.link ?? null };
}

/** True once migration 0211 has run (the new columns exist). */
export async function collateralSchemaReady(): Promise<boolean> {
  const { error } = await supabase.from('partnership_collateral').select('next_review_at').limit(1);
  return !error;
}

export async function fetchCollateral(): Promise<PartnershipCollateral[]> {
  const { data, error } = await supabase
    .from('partnership_collateral')
    .select('*')
    .eq('active', true)
    .order('item_name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as CollateralRow[]).map(toCollateral);
}

export async function fetchArchivedCollateral(): Promise<PartnershipCollateral[]> {
  const { data, error } = await supabase
    .from('partnership_collateral')
    .select('*')
    .eq('active', false)
    .order('item_name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as CollateralRow[]).map(toCollateral);
}

export type CollateralInput = Pick<
  PartnershipCollateral,
  'item_name' | 'qty_on_hand' | 'notes' | 'owner_id' | 'last_reviewed_at' | 'next_review_at' | 'link'
>;

export async function createCollateralItem(input: CollateralInput): Promise<void> {
  const { error } = await supabase.from('partnership_collateral').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateCollateralItem(
  id: string,
  patch: Partial<CollateralInput>,
): Promise<void> {
  const { error } = await supabase
    .from('partnership_collateral')
    .update(patch)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Reviewed today; next review on the given date. Closes the open review task (0211 trigger). */
export async function markCollateralReviewed(id: string, nextReview: string): Promise<void> {
  await updateCollateralItem(id, { last_reviewed_at: localDate(), next_review_at: nextReview });
}

/** Archive (false) or restore (true). Archiving removes its open review task (0211 trigger). */
export async function setCollateralActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('partnership_collateral')
    .update({ active })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Social posts ─────────────────────────────────────────────────────

export async function fetchSocialPosts(): Promise<PartnershipSocialPost[]> {
  const { data, error } = await supabase
    .from('partnership_social_posts')
    .select('*')
    .order('planned_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PartnershipSocialPost[];
}

export type SocialPostInput = Pick<
  PartnershipSocialPost,
  'platform' | 'content_idea' | 'planned_date' | 'notes'
>;

export async function createSocialPost(input: SocialPostInput): Promise<void> {
  const { error } = await supabase.from('partnership_social_posts').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateSocialPost(
  id: string,
  patch: Partial<Pick<PartnershipSocialPost, 'platform' | 'content_idea' | 'planned_date' | 'status' | 'notes'>>,
): Promise<void> {
  const { error } = await supabase
    .from('partnership_social_posts')
    .update(patch)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSocialPost(id: string): Promise<void> {
  const { error } = await supabase
    .from('partnership_social_posts')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Events ───────────────────────────────────────────────────────────

export async function fetchEvents(): Promise<PartnershipEvent[]> {
  const { data, error } = await supabase
    .from('partnership_events')
    .select('*')
    .order('event_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PartnershipEvent[];
}

export type EventInput = Pick<
  PartnershipEvent,
  'event_name' | 'event_date' | 'location' | 'attendees' | 'notes'
>;

export async function createEvent(input: EventInput): Promise<PartnershipEvent> {
  const { data, error } = await supabase
    .from('partnership_events')
    .insert(input)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as PartnershipEvent;
}

export async function updateEvent(id: string, patch: Partial<EventInput>): Promise<void> {
  const { error } = await supabase.from('partnership_events').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Connections ──────────────────────────────────────────────────────

export async function fetchConnections(eventId?: string): Promise<PartnershipConnection[]> {
  let q = supabase
    .from('partnership_connections')
    .select('*')
    .order('followup_due', { ascending: true });
  if (eventId) q = q.eq('event_id', eventId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PartnershipConnection[];
}

export type ConnectionInput = Pick<
  PartnershipConnection,
  'event_id' | 'name' | 'organization' | 'role' | 'phone' | 'email' | 'website' | 'what_discussed' | 'next_action' | 'followup_due' | 'owner_id'
>;

export async function createConnection(input: ConnectionInput): Promise<void> {
  const { error } = await supabase.from('partnership_connections').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateConnection(
  id: string,
  patch: Partial<Pick<PartnershipConnection, 'name' | 'organization' | 'role' | 'phone' | 'email' | 'website' | 'what_discussed' | 'next_action' | 'followup_due' | 'followup_done' | 'event_id' | 'owner_id'>>,
): Promise<void> {
  const { error } = await supabase
    .from('partnership_connections')
    .update(patch)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteConnection(id: string): Promise<void> {
  const { error } = await supabase.from('partnership_connections').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Multiple dated interactions with the same connection -- not a cadenced
 *  touchpoint (a connection has no cadence yet), just a plain log so a second
 *  or third conversation doesn't have to get crammed into what_discussed. */
export async function fetchConnectionNotes(connectionId: string): Promise<ConnectionNote[]> {
  const { data, error } = await supabase
    .from('partnership_connection_notes')
    .select('*')
    .eq('connection_id', connectionId)
    .order('occurred_on', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ConnectionNote[];
}

export async function addConnectionNote(
  connectionId: string,
  occurredOn: string,
  note: string,
  loggedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('partnership_connection_notes')
    .insert({ connection_id: connectionId, occurred_on: occurredOn, note, logged_by: loggedBy });
  if (error) throw new Error(error.message);
}

/** Push overdue connection follow-ups onto each connection's owner's Incoming Tasks (dedup-safe). Connections with no owner set are skipped. */
export async function syncOverdueConnectionFollowups(): Promise<number> {
  const { data, error } = await supabase.rpc('emit_overdue_connection_followups');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

/**
 * Push a "Review collateral — …" task to each item's owner once it's within two weeks of its
 * Next review date (dedup-safe; emit_collateral_review_tasks(), migration 0211). Returns the
 * number of tasks emitted.
 */
export async function syncCollateralReviewTasks(): Promise<number> {
  const { data, error } = await supabase.rpc('emit_collateral_review_tasks');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

// ─── Recurring settings (social posting + newsletter) ──────────────────

export async function fetchRecurringSetting(
  kind: RecurringSettingKind,
): Promise<PartnershipRecurringSetting | null> {
  const { data, error } = await supabase
    .from('partnership_recurring_settings')
    .select('*')
    .eq('kind', kind)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PartnershipRecurringSetting | null;
}

export async function updateRecurringSetting(
  kind: RecurringSettingKind,
  patch: Partial<Pick<PartnershipRecurringSetting, 'cadence_days' | 'lead_time_days' | 'owner_id'>>,
): Promise<void> {
  const { error } = await supabase
    .from('partnership_recurring_settings')
    .update(patch)
    .eq('kind', kind);
  if (error) throw new Error(error.message);
}

/** The posting rhythm (migration 0212): post at least this often. The owner gets a reminder
 *  when nothing has been posted in this many days; planned posts don't count. Fixed, not a setting. */
export const SOCIAL_RHYTHM_DAYS = 14;

/** Push the "No social post in two weeks" task to the social_post settings owner (dedup-safe). */
export async function syncSocialPostReminder(): Promise<number> {
  const { data, error } = await supabase.rpc('emit_social_post_reminder');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

/** Push per-entry newsletter/comms tasks once inside the configured lead window (dedup-safe). */
export async function syncNewsletterReminderTasks(): Promise<number> {
  const { data, error } = await supabase.rpc('emit_newsletter_reminder_tasks');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

// ─── Connection archive (migration 0200) ──────────────────────────────
// Archiving means "logged it, did any follow-up, done with it" -- so it also marks the
// follow-up done, which keeps it off the home screen and closes any follow-up task.
export async function archiveConnection(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('partnership_connections')
    .update({ archived_at: new Date().toISOString(), archived_by: userId, followup_done: true })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restoreConnection(id: string): Promise<void> {
  const { error } = await supabase
    .from('partnership_connections')
    .update({ archived_at: null, archived_by: null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** After "Add to Directory": point the connection at its new record and archive it.
 *  Quietly does nothing before 0200 runs (the columns don't exist yet). */
export async function markConnectionMoved(id: string, partnerId: string, userId: string): Promise<void> {
  await supabase
    .from('partnership_connections')
    .update({ converted_to_partner_id: partnerId, archived_at: new Date().toISOString(), archived_by: userId, followup_done: true })
    .eq('id', id);
}
