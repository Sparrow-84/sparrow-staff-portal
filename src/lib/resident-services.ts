import { supabase } from './supabase';
import { TOWNS, cityArea, type OrgAddress } from './locations';
import type { Partner } from './partnerships-types';

// Resident Services room (migration 0199). The Directory (partners) holds the relationship
// with an organization; a service here is what a resident can actually get from it. A
// service links to its organization's Directory record, or -- for a program with no local
// organization (a scholarship, a statewide program) -- names its provider directly.

export const SERVICE_TYPES = [
  'Shelter', 'Housing', 'Day services', 'Food', 'Health', 'Recovery', 'Financial',
  'Legal', 'Transportation', 'Employment', 'Education', 'Disability help', 'Other',
] as const;

/** "All people" counts as serving every specific group too (see servesGroup). */
export const SERVES_ALL = 'All people';
export const SERVES_OPTIONS = [
  SERVES_ALL, 'Families with children', 'Single adults', 'Men only', 'Women only',
  'Youth', 'Seniors', 'Veterans', 'People with disabilities',
] as const;

/** How a "Who it serves" tag reads as a filter ("who is this for?"). A single mom = Women +
 *  Families with children. */
export const SERVES_FILTER_LABEL: Record<string, string> = {
  'Men only': 'Men',
  'Women only': 'Women',
  'People with disabilities': 'Disability',
};

/** The groups a person can be, for filtering (everything but "All people"). */
export const PERSON_GROUPS = SERVES_OPTIONS.filter((g) => g !== SERVES_ALL);


export type CheckedHow = 'called' | 'website' | 'in_person' | 'edited';
export const CHECKED_HOW_LABEL: Record<CheckedHow, string> = {
  called: 'called them',
  website: 'checked their website',
  in_person: 'in person',
  edited: 'edited',
};

/** The Directory fields a service shows alongside itself (stored once, on the partner). */
export interface ServicePartner {
  id: string;
  name: string;
  contact_name: string | null;
  role: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  mou_status: 'not_needed' | 'needed' | 'on_file' | null;
  info_checked_at: string | null;
  info_checked_by: string | null;
  info_checked_how: CheckedHow | null;
}

export interface ResidentService {
  id: string;
  partner_id: string | null;
  provider_name: string | null;
  name: string;
  service_type: string;
  serves: string[];
  /** Migration 0216: no longer used (0224 replaced it with locations). */
  areas?: string[];
  /** Migration 0224: where people go -- the organization's addresses ticked for this program,
   *  Remote, or Unknown (which stands alone). Missing before 0224 runs. */
  location_remote?: boolean;
  location_unknown?: boolean;
  locations?: { address: OrgAddress | null }[];
  address: string | null;
  address_confidential: boolean;
  help_phone: string | null;
  hours: string | null;
  how_to_access: string | null;
  website: string | null;
  internal_notes: string | null;
  /** Migration 0200: which of the organization's contacts to call about this program. */
  go_to_contact_id?: string | null;
  owner_id: string | null;
  created_by: string | null;
  last_checked_at: string | null;
  last_checked_by: string | null;
  last_checked_how: CheckedHow | null;
  published_at: string | null;
  published_by: string | null;
  archived_at: string | null;
  created_at: string;
  /** Migration 0206: added while reviewing something sent from the Directory, and not yet
   *  confirmed. Not "checked", not in the main list, can't be published. */
  needs_review?: boolean;
  partner: ServicePartner | null;
}

// Where people go is saved separately (setProgramLocation, migration 0224); the old
// address / address_confidential columns are no longer written.
export type ServiceInput = Pick<ResidentService,
  'partner_id' | 'provider_name' | 'name' | 'service_type' | 'serves'
  | 'help_phone' | 'hours' | 'how_to_access' | 'website' | 'internal_notes'>
  & { go_to_contact_id?: string | null; needs_review?: boolean; areas?: string[] };

/** An organization sent over from the Directory, waiting in the room's "To review" inbox. */
export interface ServiceReview {
  id: string;
  partner_id: string;
  sent_by: string | null;
  sent_at: string;
  reviewed_at: string | null;
  /** Migration 0222: added from the Resident Services room itself, not sent from Partnerships. */
  added_by_resident_services?: boolean;
  partner: {
    id: string;
    name: string;
    type: Partner['type'];
    sub_category: Partner['sub_category'];
    website: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    source: string | null;
  } | null;
}

const SELECT = '*, partner:partners(id, name, contact_name, role, phone, address, website, mou_status, info_checked_at, info_checked_by, info_checked_how)';
// With where people go (migration 0224). Each fetch tries this first and falls back to SELECT
// before 0224 runs, so the room keeps working.
const SELECT_WITH_LOCATIONS = `${SELECT}, locations:resident_service_locations(address:organization_addresses(id, partner_id, label, street, city, is_private))`;

/** The organization name a service is listed under. */
export function providerName(s: Pick<ResidentService, 'provider_name' | 'partner'>): string {
  return s.partner?.name ?? s.provider_name ?? 'Unknown provider';
}

export function servesGroup(s: Pick<ResidentService, 'serves'>, group: string): boolean {
  return group === SERVES_ALL || s.serves.includes(SERVES_ALL) || s.serves.includes(group);
}

/** The filter rule agreed 2026-11-11, shared by the room, the printout and the website:
 *  tick everything that describes the person. A service shows if it's for "All people" or
 *  tagged with any of the picks -- except a men-only or women-only service is hidden from
 *  someone who picked the other one. No picks = everything. */
export function matchesPerson(s: Pick<ResidentService, 'serves'>, picks: string[]): boolean {
  if (picks.length === 0) return true;
  const pickedMen = picks.includes('Men only');
  const pickedWomen = picks.includes('Women only');
  const menOnly = s.serves.includes('Men only') && !s.serves.includes('Women only');
  const womenOnly = s.serves.includes('Women only') && !s.serves.includes('Men only');
  if (menOnly && pickedWomen && !pickedMen) return false;
  if (womenOnly && pickedMen && !pickedWomen) return false;
  return s.serves.includes(SERVES_ALL) || picks.some((g) => s.serves.includes(g));
}

/** A program's ticked addresses (none for Remote-only, Unknown, or before 0224 runs). */
export function programAddresses(s: Pick<ResidentService, 'locations' | 'location_unknown'>): OrgAddress[] {
  if (s.location_unknown) return [];
  return (s.locations ?? []).map((l) => l.address).filter((a): a is OrgAddress => !!a);
}

/** "Corvallis Office — 257 SW Madison Ave, Corvallis" lines, plus "Remote", for showing
 *  where people go. Unknown or nothing ticked gives an empty list. A private location shows
 *  its city only. */
export function locationLines(s: Pick<ResidentService, 'locations' | 'location_unknown' | 'location_remote'>): string[] {
  const lines = programAddresses(s).map((a) =>
    a.is_private
      ? `${a.label}: ${a.city ?? ''} · private location, call them for it`
      : `${a.label}: ${[a.street, a.city].filter(Boolean).join(', ')}`);
  if (s.location_remote && !s.location_unknown) lines.push('Remote: by video call or phone');
  return lines;
}

/** No location yet: Unknown, or nothing ticked at all. */
export function needsLocation(s: Pick<ResidentService, 'locations' | 'location_unknown' | 'location_remote'>): boolean {
  if (s.location_remote === undefined) return false;   // before 0224 runs
  return !!s.location_unknown || (!s.location_remote && programAddresses(s).length === 0);
}

/** The "Where" filter (agreed 2026-11-12): is the program somewhere this person can get to?
 *  Worked out from where it IS -- its addresses' cities -- not from who it serves.
 *  - A town (Corvallis, Philomath) shows only programs with an address in that town, for
 *    residents who don't drive.
 *  - A county shows programs with an address anywhere in it, towns included.
 *  - "Farther away" is any city not in our three counties (Salem, Eugene, Portland).
 *  - Remote programs show under every pick, and on their own under "Remote".
 *  - Unknown shows only when nothing is picked.
 *  No picks = everything. */
export function matchesAreas(s: Pick<ResidentService, 'locations' | 'location_unknown' | 'location_remote'>, picks: string[]): boolean {
  if (picks.length === 0) return true;
  if (s.location_remote && !s.location_unknown) return true;
  const places = programAddresses(s);
  return places.some((a) => {
    const city = (a.city ?? '').trim().toLowerCase();
    const area = cityArea(a.city);
    return picks.some((p) =>
      (TOWNS as readonly string[]).includes(p) ? city === p.toLowerCase() : area === p);
  });
}

// ── Freshness ("last checked") — shared with the Directory record drawer ──────────────
// Amber at 9 months (that's also when the room admin gets a re-check task), red at 18 months.
// The public website separately drops anything not checked in 2 years.
export type Freshness = 'fresh' | 'aging' | 'stale' | 'never';
const MONTH_MS = 1000 * 60 * 60 * 24 * 30.44;

export function freshness(checkedAt: string | null, now: Date = new Date()): Freshness {
  if (!checkedAt) return 'never';
  const months = (now.getTime() - new Date(checkedAt).getTime()) / MONTH_MS;
  if (months < 9) return 'fresh';
  if (months < 18) return 'aging';
  return 'stale';
}

export function relativeAge(checkedAt: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(checkedAt).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months ago`;
  return `${Math.floor(months / 12)} years ago`;
}

export function publicDropOffPassed(checkedAt: string | null, now: Date = new Date()): boolean {
  if (!checkedAt) return true;
  return (now.getTime() - new Date(checkedAt).getTime()) / MONTH_MS >= 24;
}

// ── Data ───────────────────────────────────────────────────────────────────────────
/** False until migration 0224 adds locations (the form then says it's waiting). */
export async function locationsReady(): Promise<boolean> {
  const { error } = await supabase.from('resident_services').select('location_remote').limit(1);
  return !error;
}

/** `missing` is true when the table doesn't exist yet (migration 0199 not run). */
export async function fetchServices(): Promise<{ services: ResidentService[]; missing: boolean }> {
  const run = (select: string) => supabase
    .from('resident_services')
    .select(select)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  let { data, error } = await run(SELECT_WITH_LOCATIONS);
  if (error) ({ data, error } = await run(SELECT));
  if (error) return { services: [], missing: true };
  return { services: (data ?? []) as unknown as ResidentService[], missing: false };
}

/** For the Directory drawer's "Services they offer" -- quietly empty before 0199 runs. */
export async function fetchServicesForPartner(partnerId: string): Promise<ResidentService[]> {
  const { data, error } = await supabase
    .from('resident_services')
    .select(SELECT)
    .eq('partner_id', partnerId)
    .is('archived_at', null)
    .order('name');
  if (error) return [];
  return (data ?? []) as unknown as ResidentService[];
}

export async function createService(input: ServiceInput): Promise<string> {
  const { data, error } = await supabase.from('resident_services').insert(input).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function updateService(id: string, patch: Partial<ServiceInput>): Promise<void> {
  const { error } = await supabase.from('resident_services').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markServiceChecked(id: string, how: Exclude<CheckedHow, 'edited'>, userId: string): Promise<void> {
  const { error } = await supabase
    .from('resident_services')
    .update({ last_checked_at: new Date().toISOString(), last_checked_by: userId, last_checked_how: how })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Only ever called from an explicit "Publish to website" click -- never a default. */
export async function publishService(id: string): Promise<void> {
  const { error } = await supabase.from('resident_services').update({ published_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function unpublishService(id: string): Promise<void> {
  const { error } = await supabase.from('resident_services').update({ published_at: null }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Archive, never delete: the service leaves the list and the website but keeps its history,
 *  and can be restored from the room's "Archived" view. */
export async function archiveService(id: string): Promise<void> {
  const { error } = await supabase
    .from('resident_services')
    .update({ archived_at: new Date().toISOString(), published_at: null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Back onto the main list. Not republished: someone has to click "Publish to website" again. */
export async function restoreService(id: string): Promise<void> {
  const { error } = await supabase.from('resident_services').update({ archived_at: null }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Archived services for the room's "Archived" view. Programs removed while still waiting
 *  for review were never on the list, so they're left out. */
export async function fetchArchivedServices(): Promise<ResidentService[]> {
  const run = (select: string) => supabase
    .from('resident_services')
    .select(select)
    .not('archived_at', 'is', null)
    .eq('needs_review', false)
    .order('archived_at', { ascending: false });
  let { data, error } = await run(SELECT_WITH_LOCATIONS);
  if (error) ({ data, error } = await run(SELECT));
  if (error) return [];
  return (data ?? []) as unknown as ResidentService[];
}

// ── "To review" inbox (migration 0206) ───────────────────────────────────────────────
const REVIEW_SELECT = '*, partner:partners(id, name, type, sub_category, website, phone, email, address, notes, source)';

/** Quietly empty before 0206 runs. */
export async function fetchOpenReviews(): Promise<ServiceReview[]> {
  const { data, error } = await supabase
    .from('resident_service_reviews')
    .select(REVIEW_SELECT)
    .is('reviewed_at', null)
    .order('sent_at');
  if (error) return [];
  return (data ?? []) as unknown as ServiceReview[];
}

/** `available` is false until 0206 runs (the Directory hides the Send button then). */
export async function fetchOpenReviewForPartner(partnerId: string): Promise<{ review: ServiceReview | null; available: boolean }> {
  const { data, error } = await supabase
    .from('resident_service_reviews')
    .select('id, partner_id, sent_by, sent_at, reviewed_at')
    .eq('partner_id', partnerId)
    .is('reviewed_at', null)
    .maybeSingle();
  if (error) return { review: null, available: false };
  return { review: data ? ({ ...data, partner: null } as ServiceReview) : null, available: true };
}

/** One click from the Directory. Sending something already waiting is a no-op. */
export async function sendToResidentServices(partnerId: string): Promise<void> {
  const { error } = await supabase.from('resident_service_reviews').insert({ partner_id: partnerId });
  if (error && error.code !== '23505') throw new Error(error.message);
}

// ── Resident Services adds an organization itself (migration 0222) ──────────────────
/** A likely match already in the Directory. Names only -- Resident Services can't open
 *  records that aren't connected to the room. */
export interface SimilarOrganization {
  id: string;
  name: string;
  /** Why it came up: "Same name", "Similar name", "Similar spelling", "Its initials match",
   *  "Same phone number", "Same website". */
  reason: string;
  in_resident_services: boolean;
  inactive: boolean;
}

/** `available` is false until 0222 runs. */
export async function findSimilarOrganizations(
  name: string, phone: string, website: string,
): Promise<{ matches: SimilarOrganization[]; available: boolean }> {
  const { data, error } = await supabase.rpc('rs_find_similar_organizations', {
    p_name: name, p_phone: phone || null, p_website: website || null,
  });
  if (error) return { matches: [], available: false };
  return { matches: (data ?? []) as SimilarOrganization[], available: true };
}

/** "Add as a new organization". Returns the new Directory record's id. Partnerships sets
 *  its category afterwards (from their task). */
export async function addOrganization(input: {
  name: string; phone: string; website: string; openReview: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('rs_add_organization', {
    p_name: input.name, p_phone: input.phone || null,
    p_website: input.website || null, p_open_review: input.openReview,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** "Use this one": connects an existing Directory record to Resident Services. */
export async function linkOrganization(partnerId: string, openReview: boolean): Promise<void> {
  const { error } = await supabase.rpc('rs_link_organization', { p_partner_id: partnerId, p_open_review: openReview });
  if (error) throw new Error(error.message);
}

/** "Reviewed — this is correct": stamps the waiting services checked and closes the review. */
export async function completeReview(reviewId: string, how: Exclude<CheckedHow, 'edited'>): Promise<void> {
  const { error } = await supabase.rpc('complete_resident_service_review', { p_review_id: reviewId, p_how: how });
  if (error) throw new Error(error.message);
}

/** Nothing residents can use here: close the review without adding anything. */
export async function closeReviewWithoutServices(reviewId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('resident_service_reviews')
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: userId })
    .eq('id', reviewId);
  if (error) throw new Error(error.message);
}

// ── Directory record "last checked" (partners.info_checked_*) ─────────────────────────
export interface PartnerInfoChecked {
  info_checked_at: string | null;
  info_checked_by: string | null;
  info_checked_how: CheckedHow | null;
}

/** Separate from the main partner select on purpose: those columns only exist once 0199
 *  runs, and selecting them unconditionally would blank the Directory before then. */
export async function fetchPartnerInfoChecked(partnerId: string): Promise<PartnerInfoChecked | null> {
  const { data, error } = await supabase
    .from('partners')
    .select('info_checked_at, info_checked_by, info_checked_how')
    .eq('id', partnerId)
    .maybeSingle();
  if (error || !data) return null;
  return data as PartnerInfoChecked;
}

export async function markPartnerInfoChecked(partnerId: string, how: Exclude<CheckedHow, 'edited'>, userId: string): Promise<void> {
  const { error } = await supabase
    .from('partners')
    .update({ info_checked_at: new Date().toISOString(), info_checked_by: userId, info_checked_how: how })
    .eq('id', partnerId);
  if (error) throw new Error(error.message);
}

/** The most recent touchpoint on an organization's Directory record (read-only context). */
export async function fetchLatestTouchpoint(partnerId: string): Promise<{ summary: string | null; occurred_on: string; logged_by: string | null } | null> {
  const { data, error } = await supabase
    .from('partner_touchpoints')
    .select('summary, occurred_on, logged_by')
    .eq('partner_id', partnerId)
    .order('occurred_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as { summary: string | null; occurred_on: string; logged_by: string | null };
}

export async function updatePartnerContact(
  partnerId: string,
  patch: Partial<Pick<ServicePartner, 'contact_name' | 'role' | 'phone' | 'address'>>,
): Promise<void> {
  const { error } = await supabase.from('partners').update(patch).eq('id', partnerId);
  if (error) throw new Error(error.message);
}
