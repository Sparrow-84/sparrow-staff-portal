import { supabase } from './supabase';

// Resident Services room (migration 0199). The Directory (partners) holds the relationship
// with an organization; a service here is what a resident can actually get from it. A
// service links to its organization's Directory record, or -- for a program with no local
// organization (a scholarship, a statewide program) -- names its provider directly.

export const SERVICE_TYPES = [
  'Shelter', 'Housing', 'Day services', 'Food', 'Health', 'Recovery', 'Financial',
  'Legal', 'Transportation', 'Employment', 'Education', 'Other',
] as const;

/** "All people" counts as serving every specific group too (see servesGroup). */
export const SERVES_ALL = 'All people';
export const SERVES_OPTIONS = [
  SERVES_ALL, 'Families with children', 'Single adults', 'Men only', 'Women only',
  'Youth', 'Seniors', 'Veterans',
] as const;

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
  partner: ServicePartner | null;
}

export type ServiceInput = Pick<ResidentService,
  'partner_id' | 'provider_name' | 'name' | 'service_type' | 'serves' | 'address' | 'address_confidential'
  | 'help_phone' | 'hours' | 'how_to_access' | 'website' | 'internal_notes'> & { go_to_contact_id?: string | null };

const SELECT = '*, partner:partners(id, name, contact_name, role, phone, address, website, mou_status, info_checked_at, info_checked_by, info_checked_how)';

/** The organization name a service is listed under. */
export function providerName(s: Pick<ResidentService, 'provider_name' | 'partner'>): string {
  return s.partner?.name ?? s.provider_name ?? 'Unknown provider';
}

export function servesGroup(s: Pick<ResidentService, 'serves'>, group: string): boolean {
  return group === SERVES_ALL || s.serves.includes(SERVES_ALL) || s.serves.includes(group);
}

// ── Freshness ("last checked") — shared with the Directory record drawer ──────────────
// Amber at 9 months (that's also when the owner gets a re-check task), red at 18 months.
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
/** `missing` is true when the table doesn't exist yet (migration 0199 not run). */
export async function fetchServices(): Promise<{ services: ResidentService[]; missing: boolean }> {
  const { data, error } = await supabase
    .from('resident_services')
    .select(SELECT)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
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

export async function updateService(id: string, patch: Partial<ServiceInput> & { owner_id?: string | null }): Promise<void> {
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

export async function archiveService(id: string): Promise<void> {
  const { error } = await supabase
    .from('resident_services')
    .update({ archived_at: new Date().toISOString(), published_at: null })
    .eq('id', id);
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
