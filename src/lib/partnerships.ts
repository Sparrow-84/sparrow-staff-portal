import { supabase } from './supabase';
import type {
  Donation,
  DonorStat,
  DonorTier,
  GivingMethod,
  MouStatus,
  Partner,
  PartnerStage,
  PartnerType,
  Touchpoint,
  TouchpointMethod,
} from './partnerships-types';

// All reads/writes are gated by RLS (0008_partnerships.sql): partnerships staff + admins
// manage everything; a partner's named owner sees/stewards their own.

const PARTNER_COLS =
  'id, name, type, stage, owner_id, organization, contact_name, email, phone, address, donor_tier, cadence_days, last_touchpoint_at, source, notes, active, created_at, giving_method, newsletter_subscribed, first_gift_date, sparrow_provides, partner_provides, mou_status';

// ── Partners ─────────────────────────────────────────────────────────
export async function fetchPartners(): Promise<Partner[]> {
  const { data, error } = await supabase
    .from('partners')
    .select(PARTNER_COLS)
    .eq('active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Partner[];
}

export async function fetchArchivedPartners(): Promise<Partner[]> {
  const { data, error } = await supabase
    .from('partners')
    .select(PARTNER_COLS)
    .eq('active', false)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Partner[];
}

export interface PartnerInput {
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
  source: string | null;
  notes: string | null;
}

export async function createPartner(input: PartnerInput): Promise<void> {
  const { error } = await supabase.from('partners').insert(input);
  if (error) throw new Error(error.message);
}

export async function updatePartner(
  id: string,
  patch: Partial<
    Pick<
      Partner,
      | 'name'
      | 'type'
      | 'stage'
      | 'owner_id'
      | 'organization'
      | 'contact_name'
      | 'email'
      | 'phone'
      | 'address'
      | 'donor_tier'
      | 'cadence_days'
      | 'source'
      | 'notes'
      | 'active'
      | 'giving_method'
      | 'newsletter_subscribed'
      | 'first_gift_date'
      | 'sparrow_provides'
      | 'partner_provides'
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
 * Log a contact with a partner. A DB trigger advances the partner's last_touchpoint_at and
 * resolves any open "touchpoint due" task the spine had raised for them — keeping the rhythm
 * is what clears the nudge.
 */
export async function logTouchpoint(input: TouchpointInput, loggedBy: string): Promise<void> {
  const { error } = await supabase
    .from('partner_touchpoints')
    .insert({ ...input, logged_by: loggedBy });
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

/**
 * Push a "Re-engage" task for every lapsed partner with an owner (dedup-safe).
 * Requires migration 0036. The task resolves automatically when the partner's stage
 * is changed off 'lapsed' via the on_partner_stage_changed DB trigger.
 */
export async function syncLapsedPartnerTasks(): Promise<number> {
  const { data, error } = await supabase.rpc('emit_lapsed_partner_tasks');
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
    if (error.message.includes('relation') && error.message.includes('does not exist')) return [];
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
    if (error.message.includes('relation') && error.message.includes('does not exist')) return [];
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
    if (p.type !== 'donor' || p.donor_tier === 'major') continue;
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

/**
 * Emit a 72-hour follow-up task when a donor gives for the first time.
 * Andrew's rule: the owner calls or writes within 72 hours (3 days).
 * Dedup-safe via source_ref = 'first_time_donor:<partner_id>' — re-running
 * updates the due date in place rather than creating duplicates.
 * Only called when owner_id is set; silent no-op if owner is unassigned.
 */
export async function emitFirstTimeDonorTask(
  partnerId: string,
  partnerName: string,
  ownerId: string,
): Promise<void> {
  const due = new Date();
  due.setDate(due.getDate() + 3);
  const { error } = await supabase.rpc('emit_system_task', {
    p_system: 'crm',
    p_ref: `first_time_donor:${partnerId}`,
    p_assignee: ownerId,
    p_title: `First-time donor follow-up — ${partnerName} (72-hr window)`,
    p_department: 'partnerships',
    p_priority: 'p2',
    p_due: due.toLocaleDateString('en-CA'),
  });
  if (error) throw new Error(error.message);
}

// Re-export types for convenience
export type { GivingMethod, MouStatus };
