import { supabase } from './supabase';
import type {
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

// Re-export types for convenience
export type { GivingMethod, MouStatus };
