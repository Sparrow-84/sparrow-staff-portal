import { supabase } from './supabase';
import type {
  Donation,
  DonorStat,
  DonorTier,
  GivingMethod,
  MouStatus,
  Partner,
  PartnerCheckin,
  PartnerStage,
  PartnerSubCategory,
  PartnerType,
  Touchpoint,
  TouchpointMethod,
  VolunteerSubCategory,
} from './partnerships-types';
import { partnerMatchesType } from './partnerships-types';

// All reads/writes are gated by RLS (0008_partnerships.sql): partnerships staff + admins
// manage everything; a partner's named owner sees/stewards their own.

const PARTNER_COLS =
  'id, name, type, secondary_types, sub_category, first_name, last_name, stage, owner_id, contact_name, role, website, email, phone, address, donor_tier, needs_additional_touchpoint, additional_touchpoint_label, additional_touchpoint_due, last_touchpoint_at, source, notes, active, created_at, giving_method, newsletter_subscribed, first_gift_date, newsletter_unsubscribed_at, newsletter_unsubscribe_dismissed_at, sparrow_provides, partner_provides, partner_provides_tags, mou_status, business_card_front_path, business_card_back_path';

/** The Partnerships room admin (Staff page → room admin), who gets the room's unowned work:
 *  prayer check-ins and check-ins on records with no owner. Null when nobody is set, so the
 *  caller can fall back. Same lookup as emit_due_touchpoint_tasks() in migration 0209. */
export async function fetchPartnershipsRoomAdminId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('active', true)
    .contains('sop_admin_rooms', ['partnerships'])
    .order('full_name')
    .limit(1);
  if (error) return null;
  return data?.[0]?.id ?? null;
}

// ── Partners ─────────────────────────────────────────────────────────
async function fetchPartnersWhere(active: boolean): Promise<Partner[]> {
  const [{ data, error }, checkins] = await Promise.all([
    supabase
      .from('partners')
      .select(`${PARTNER_COLS}, volunteer_sub_categories`)
      .eq('active', active)
      .order('name'),
    fetchOpenCheckins(),
  ]);
  if (error) throw new Error(error.message);
  return attachCheckins((data ?? []) as unknown as Partner[], checkins);
}

// ── Check-ins (migration 0209) ───────────────────────────────────────

const CHECKINS_NOT_READY = "Check-ins need tonight's database update (migration 0209) first.";

function isMissingTable(message: string): boolean {
  return /partner_checkins|complete_partner_checkin|does not exist|schema cache/i.test(message);
}

/** Every open check-in, soonest first. null when migration 0209 hasn't run yet, so callers
 *  fall back to the old one-per-record columns instead of breaking the room. */
export async function fetchOpenCheckins(): Promise<PartnerCheckin[] | null> {
  const { data, error } = await supabase
    .from('partner_checkins')
    .select('id, partner_id, label, due_date')
    .is('done_at', null)
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) {
    if (isMissingTable(error.message)) return null;
    throw new Error(error.message);
  }
  return (data ?? []) as PartnerCheckin[];
}

/** Puts each record's open check-ins on it. Before 0209 has run (checkins = null), reads the
 *  old single check-in off the record instead, read-only. */
export function attachCheckins<T extends Pick<Partner, 'id' | 'needs_additional_touchpoint' | 'additional_touchpoint_label' | 'additional_touchpoint_due'>>(
  partners: T[],
  checkins: PartnerCheckin[] | null,
): (T & { checkins: PartnerCheckin[] })[] {
  if (checkins == null) {
    return partners.map((p) => ({
      ...p,
      checkins: p.needs_additional_touchpoint && (p.additional_touchpoint_label || p.additional_touchpoint_due)
        ? [{ id: `legacy:${p.id}`, partner_id: p.id, label: p.additional_touchpoint_label || 'Check-in', due_date: p.additional_touchpoint_due, legacy: true }]
        : [],
    }));
  }
  const byPartner = new Map<string, PartnerCheckin[]>();
  for (const c of checkins) {
    const list = byPartner.get(c.partner_id) ?? [];
    list.push(c);
    byPartner.set(c.partner_id, list);
  }
  return partners.map((p) => ({ ...p, checkins: byPartner.get(p.id) ?? [] }));
}

function checkinError(message: string): Error {
  return new Error(isMissingTable(message) ? CHECKINS_NOT_READY : message);
}

export async function addCheckin(partnerId: string, label: string, dueDate: string): Promise<void> {
  const { error } = await supabase.from('partner_checkins').insert({ partner_id: partnerId, label, due_date: dueDate });
  if (error) throw checkinError(error.message);
}

/** Changing the date closes the old date's task; the new date gets its own when it's due. */
export async function updateCheckin(id: string, patch: { label?: string; due_date?: string }): Promise<void> {
  const { error } = await supabase.from('partner_checkins').update(patch).eq('id', id);
  if (error) throw checkinError(error.message);
}

export async function deleteCheckin(id: string): Promise<void> {
  const { error } = await supabase.from('partner_checkins').delete().eq('id', id);
  if (error) throw checkinError(error.message);
}

/** Done: closes only this check-in and its task, logs it in the record's touchpoint history,
 *  and schedules the next one of the same kind when nextDue is given. */
export async function completeCheckin(id: string, nextDue: string | null): Promise<void> {
  const { error } = await supabase.rpc('complete_partner_checkin', { p_checkin: id, p_next_due: nextDue });
  if (error) throw checkinError(error.message);
}

export async function fetchPartners(): Promise<Partner[]> {
  return fetchPartnersWhere(true);
}

export async function fetchArchivedPartners(): Promise<Partner[]> {
  return fetchPartnersWhere(false);
}

export interface PartnerInput {
  name: string;
  type: PartnerType;
  secondary_types: PartnerType[];
  sub_category: PartnerSubCategory | null;
  first_name: string | null;
  last_name: string | null;
  stage: PartnerStage;
  owner_id: string | null;
  contact_name: string | null;
  role: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  donor_tier: DonorTier | null;
  source: string | null;
  notes: string | null;
  /** Only sent when the record is a Volunteer (needs migration 0207). */
  volunteer_sub_categories?: VolunteerSubCategory[];
}

export async function createPartner(input: PartnerInput): Promise<string> {
  const { data, error } = await supabase.from('partners').insert(input).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Soft duplicate check before creating a partner — same active name or same active email. */
export async function findPossibleDuplicatePartner(
  name: string,
  email: string | null,
): Promise<{ id: string; name: string } | null> {
  const trimmedName = name.trim();
  const { data: byName, error: nameErr } = await supabase
    .from('partners')
    .select('id, name')
    .eq('active', true)
    .ilike('name', trimmedName)
    .limit(1);
  if (nameErr) throw new Error(nameErr.message);
  if (byName && byName.length > 0) return byName[0] as { id: string; name: string };

  const trimmedEmail = email?.trim();
  if (trimmedEmail) {
    const { data: byEmail, error: emailErr } = await supabase
      .from('partners')
      .select('id, name')
      .eq('active', true)
      .ilike('email', trimmedEmail)
      .limit(1);
    if (emailErr) throw new Error(emailErr.message);
    if (byEmail && byEmail.length > 0) return byEmail[0] as { id: string; name: string };
  }
  return null;
}

export async function updatePartner(
  id: string,
  patch: Partial<
    Pick<
      Partner,
      | 'name'
      | 'type'
      | 'secondary_types'
      | 'sub_category'
      | 'volunteer_sub_categories'
      | 'first_name'
      | 'last_name'
      | 'stage'
      | 'owner_id'
      | 'contact_name'
      | 'role'
      | 'website'
      | 'email'
      | 'phone'
      | 'address'
      | 'donor_tier'
      | 'source'
      | 'notes'
      | 'active'
      | 'giving_method'
      | 'newsletter_subscribed'
      | 'first_gift_date'
      | 'newsletter_unsubscribe_dismissed_at'
      | 'sparrow_provides'
      | 'partner_provides'
      | 'partner_provides_tags'
      | 'mou_status'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('partners').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Touchpoints ──────────────────────────────────────────────────────
export async function fetchTouchpoints(partnerId: string): Promise<Touchpoint[]> {
  const { data, error } = await supabase
    .from('partner_touchpoints')
    .select('id, partner_id, logged_by, method, occurred_on, summary, created_at')
    .eq('partner_id', partnerId)
    .order('occurred_on', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Touchpoint[];
}

export interface TouchpointInput {
  partner_id: string;
  method: TouchpointMethod;
  occurred_on: string;
  summary: string | null;
}

/**
 * Log a contact with a partner. A DB trigger advances the partner's last_touchpoint_at. It
 * doesn't close any check-in (migration 0209) — only that check-in's Done does.
 */
export async function logTouchpoint(input: TouchpointInput, loggedBy: string): Promise<void> {
  const { error } = await supabase
    .from('partner_touchpoints')
    .insert({ ...input, logged_by: loggedBy });
  if (error) throw new Error(error.message);
}

export async function updateTouchpoint(
  id: string,
  patch: { method?: TouchpointMethod; occurred_on?: string; summary?: string | null },
): Promise<void> {
  const { error } = await supabase.from('partner_touchpoints').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTouchpoint(id: string): Promise<void> {
  const { error } = await supabase.from('partner_touchpoints').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Spine integration ────────────────────────────────────────────────
/**
 * Push every overdue touchpoint onto its owner's Incoming Tasks (dedup-safe; re-running just
 * updates in place). Best-effort — called on room load so an overdue relationship becomes a
 * real task on a real person's day, not just a red dot someone has to remember to look at.
 * Returns the number of due tasks emitted, or 0 if the caller isn't CRM-facing.
 */
export async function syncDueTouchpointTasks(): Promise<number> {
  const { data, error } = await supabase.rpc('emit_due_touchpoint_tasks');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}


// ── Donations ────────────────────────────────────────────────────────

/**
 * Fetch aggregate donation stats for all partners in one query.
 * Returns an empty array (graceful fallback) if the donations table doesn't
 * exist yet — callers treat missing stats as "no data" rather than crashing.
 */
export async function fetchDonorStats(): Promise<DonorStat[]> {
  const { data, error } = await supabase
    .from('donations')
    .select('partner_id, received_on, amount_above_10k')
    .not('partner_id', 'is', null);
  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('schema cache')) return [];
    throw new Error(error.message);
  }
  const map = new Map<string, DonorStat>();
  for (const row of data ?? []) {
    const pid = row.partner_id as string;
    const existing = map.get(pid);
    if (!existing) {
      map.set(pid, {
        partner_id: pid,
        gift_count: 1,
        last_gift_date: row.received_on as string,
        has_major_gift: row.amount_above_10k as boolean,
      });
    } else {
      existing.gift_count++;
      if ((row.received_on as string) > (existing.last_gift_date ?? '')) {
        existing.last_gift_date = row.received_on as string;
      }
      if (row.amount_above_10k) existing.has_major_gift = true;
    }
  }
  return Array.from(map.values());
}

/** Fetch the full donation list for one partner — shown in their detail panel. */
export async function fetchDonations(partnerId: string): Promise<Donation[]> {
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .eq('partner_id', partnerId)
    .order('received_on', { ascending: false });
  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('schema cache')) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as Donation[];
}

/**
 * Auto-patch donor_tier to 'lapsed' for any donor whose last gift was 12+ months ago
 * and who isn't already marked 'major'. Called on room load alongside other sync tasks
 * so Bethany never has to manually set a tier to lapsed — it just happens.
 */
export async function syncLapsedDonorTiers(
  partners: Partner[],
  stats: DonorStat[],
): Promise<void> {
  const today = new Date();
  const LAPSED_MS = 365 * 86_400_000;
  const statMap = new Map(stats.map((s) => [s.partner_id, s]));
  const patches: Promise<void>[] = [];
  for (const p of partners) {
    if (!partnerMatchesType(p, 'donor') || p.donor_tier === 'major') continue;
    const stat = statMap.get(p.id);
    if (!stat || stat.gift_count === 0) continue;
    if (!stat.last_gift_date) continue;
    const daysSince = today.getTime() - new Date(`${stat.last_gift_date}T12:00:00`).getTime();
    if (daysSince >= LAPSED_MS && p.donor_tier !== 'lapsed') {
      patches.push(updatePartner(p.id, { donor_tier: 'lapsed' }).catch(() => undefined));
    }
  }
  await Promise.all(patches);
}


// ── Givebutter sync: needs-review donations ─────────────────────────────

export interface NeedsReviewDonation {
  donation: Donation;
  candidateName: string | null;
}

/**
 * Donations the Givebutter webhook couldn't confidently match — the email
 * didn't match anyone on file, but the name loosely did (see
 * find_possible_donor_match in 0088). Waiting on a human to link or confirm.
 */
export async function fetchNeedsReviewDonations(): Promise<NeedsReviewDonation[]> {
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .is('partner_id', null)
    .not('possible_match_partner_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('schema cache')) return [];
    throw new Error(error.message);
  }
  const donations = (data ?? []) as Donation[];
  if (donations.length === 0) return [];

  const candidateIds = [...new Set(donations.map((d) => d.possible_match_partner_id).filter(Boolean))] as string[];
  const { data: candidates, error: candErr } = await supabase
    .from('partners')
    .select('id, name')
    .in('id', candidateIds);
  if (candErr) throw new Error(candErr.message);
  const nameById = new Map((candidates ?? []).map((c) => [c.id as string, c.name as string]));

  return donations.map((donation) => ({
    donation,
    candidateName: donation.possible_match_partner_id
      ? nameById.get(donation.possible_match_partner_id) ?? null
      : null,
  }));
}

/** "Link to [candidate]" — the gift belongs to an existing partner. */
export async function resolveDonationLink(donationId: string, partnerId: string): Promise<void> {
  const { error } = await supabase.rpc('resolve_donation_link', {
    p_donation_id: donationId,
    p_partner_id: partnerId,
  });
  if (error) throw new Error(error.message);
}

/** "No, this is a new donor" — creates the partner and attaches the gift. Returns the new partner id. */
export async function resolveDonationAsNewPartner(donationId: string): Promise<string> {
  const { data, error } = await supabase.rpc('resolve_donation_new_partner', {
    p_donation_id: donationId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export interface RecentUnsubscribe {
  id: string;
  name: string;
  newsletter_unsubscribed_at: string;
}

/**
 * Partners whose Brevo unsubscribe (synced automatically by the brevo-webhook Edge
 * Function, migration 0179) hasn't yet been acknowledged on Partnerships Home. Not a
 * to-do — mirrors "New contacts to review"'s tone exactly, just situational awareness.
 * Degrades gracefully (returns []) if migration 0179 hasn't landed on a given environment
 * yet, same convention used elsewhere for columns not yet migrated everywhere.
 */
export async function fetchRecentUnsubscribes(): Promise<RecentUnsubscribe[]> {
  const { data, error } = await supabase
    .from('partners')
    .select('id, name, newsletter_unsubscribed_at, newsletter_unsubscribe_dismissed_at')
    .eq('active', true)
    .not('newsletter_unsubscribed_at', 'is', null)
    .order('newsletter_unsubscribed_at', { ascending: false });
  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('schema cache')) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as (RecentUnsubscribe & { newsletter_unsubscribe_dismissed_at: string | null })[])
    .filter((p) => !p.newsletter_unsubscribe_dismissed_at || p.newsletter_unsubscribe_dismissed_at < p.newsletter_unsubscribed_at)
    .map(({ id, name, newsletter_unsubscribed_at }) => ({ id, name, newsletter_unsubscribed_at }));
}

/** Acknowledge one partner's unsubscribe FYI card — dismisses it until/unless they unsubscribe again later. */
export async function dismissUnsubscribe(partnerId: string): Promise<void> {
  const { error } = await supabase
    .from('partners')
    .update({ newsletter_unsubscribe_dismissed_at: new Date().toISOString() })
    .eq('id', partnerId);
  if (error) throw new Error(error.message);
}

/**
 * Merge a duplicate partner into another — moves donations + touchpoints, then
 * deletes the duplicate. Does not reconcile notes/tier/cadence; the caller's UI
 * should show both records so staff can copy over anything worth keeping first.
 */
export async function mergePartners(duplicateId: string, targetId: string): Promise<void> {
  const { error } = await supabase.rpc('merge_partners', {
    p_duplicate_id: duplicateId,
    p_target_id: targetId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Permanently removes a partner record that was never a real relationship
 * (added by mistake, duplicate never worth merging, etc.) — not for a
 * relationship that genuinely ended, which is what Archive is for. Touchpoints
 * are cascade-deleted with the row; any donations stay in the giving records
 * but lose their link to this partner (see FKs on `donations`).
 */
export async function deletePartner(id: string): Promise<void> {
  const { error } = await supabase.from('partners').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Re-export types for convenience
export type { GivingMethod, MouStatus };
