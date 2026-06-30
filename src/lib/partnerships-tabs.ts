import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────

export type CommType =
  | 'tsm'
  | 'tsm_easter'
  | 'tsm_midyear'
  | 'tsm_christmas'
  | 'annual_report'
  | 'giving_tuesday'
  | 'christmas_cards';

export type CommStatus = 'not_started' | 'in_progress' | 'sent';
export type ReviewCycle = 'march' | 'sept' | 'both';
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
  last_updated: string | null;
  review_cycle: ReviewCycle;
  needs_attention: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
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

export interface PartnershipConnection {
  id: string;
  event_id: string | null;
  name: string;
  organization: string | null;
  what_discussed: string | null;
  next_action: string | null;
  followup_due: string | null;
  followup_done: boolean;
  created_at: string;
  updated_at: string;
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

/** Returns the 2nd Thursday of the given month (0-indexed). */
function secondThursday(year: number, month: number): Date {
  const d = new Date(year, month, 1);
  const firstThursday = 1 + ((4 - d.getDay() + 7) % 7);
  return new Date(year, month, firstThursday + 7);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildCommsForYear(year: number): Omit<PartnershipComm, 'id' | 'created_at' | 'updated_at'>[] {
  const nov1 = new Date(year, 10, 1);
  const firstTuesdayOffset = (2 - nov1.getDay() + 7) % 7;
  const givingTuesday = new Date(year, 10, 1 + firstTuesdayOffset + 14);

  return [
    {
      year, comm_type: 'annual_report', title: 'Annual Report',
      publish_date: `${year}-01-15`, status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — January',
      publish_date: toISO(secondThursday(year, 0)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — February',
      publish_date: toISO(secondThursday(year, 1)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — March',
      publish_date: toISO(secondThursday(year, 2)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm_easter', title: 'TSM — Easter Edition',
      publish_date: toISO(secondThursday(year, 3)), status: 'not_started', is_financial_ask: true, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — May',
      publish_date: toISO(secondThursday(year, 4)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm_midyear', title: 'TSM — Mid-Year Edition',
      publish_date: toISO(secondThursday(year, 5)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — July',
      publish_date: toISO(secondThursday(year, 6)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — August',
      publish_date: toISO(secondThursday(year, 7)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — September',
      publish_date: toISO(secondThursday(year, 8)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — October',
      publish_date: toISO(secondThursday(year, 9)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'tsm', title: 'TSM — November',
      publish_date: toISO(secondThursday(year, 10)), status: 'not_started', is_financial_ask: false, notes: null,
    },
    {
      year, comm_type: 'giving_tuesday', title: 'Giving Tuesday',
      publish_date: toISO(givingTuesday), status: 'not_started', is_financial_ask: true, notes: null,
    },
    {
      year, comm_type: 'tsm_christmas', title: 'TSM — Christmas/EOY Edition',
      publish_date: toISO(secondThursday(year, 11)), status: 'not_started', is_financial_ask: true, notes: null,
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

// ─── Collateral ───────────────────────────────────────────────────────

export async function fetchCollateral(): Promise<PartnershipCollateral[]> {
  const { data, error } = await supabase
    .from('partnership_collateral')
    .select('*')
    .eq('active', true)
    .order('item_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as PartnershipCollateral[];
}

export async function fetchArchivedCollateral(): Promise<PartnershipCollateral[]> {
  const { data, error } = await supabase
    .from('partnership_collateral')
    .select('*')
    .eq('active', false)
    .order('item_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as PartnershipCollateral[];
}

export type CollateralInput = Pick<
  PartnershipCollateral,
  'item_name' | 'qty_on_hand' | 'last_updated' | 'review_cycle' | 'needs_attention' | 'notes'
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

export async function archiveCollateralItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('partnership_collateral')
    .update({ active: false })
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
  'event_id' | 'name' | 'organization' | 'what_discussed' | 'next_action' | 'followup_due'
>;

export async function createConnection(input: ConnectionInput): Promise<void> {
  const { error } = await supabase.from('partnership_connections').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateConnection(
  id: string,
  patch: Partial<Pick<PartnershipConnection, 'name' | 'organization' | 'what_discussed' | 'next_action' | 'followup_due' | 'followup_done' | 'event_id'>>,
): Promise<void> {
  const { error } = await supabase
    .from('partnership_connections')
    .update(patch)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Push overdue connection follow-ups onto the caller's Incoming Tasks (dedup-safe). */
export async function syncOverdueConnectionFollowups(): Promise<number> {
  const { data, error } = await supabase.rpc('emit_overdue_connection_followups');
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}
