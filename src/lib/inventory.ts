import { supabase } from './supabase';
import type {
  InvLocation, InvSubLocation, InvItem,
  InvMonthlySubmission, InvAddition, InvRemoval, InvComment,
  InvItemCondition, InvCostBasis, InvCostSource, InvExitMethod,
  InvBentonSchedule, InvConsumablesSnapshot, InvBatchTally,
  InvFlipStatus, InvHouseFlip, InvFlipItemCheck,
  InvFlipLeaveBehind, InvFlipNewItem,
} from './inventory-types';

// ── Column sets ───────────────────────────────────────────────────────────

const LOC_COLS = 'id, name, sort_order, is_remote, is_lcp_house';

const SUB_COLS = `
  *,
  location:inv_locations(${LOC_COLS}),
  submitter:profiles!submitted_by(id, full_name)
`;

const SUB_DETAIL_COLS = `
  *,
  location:inv_locations(${LOC_COLS}),
  submitter:profiles!submitted_by(id, full_name),
  additions:inv_additions(*, sub_location:inv_sub_locations(*)),
  removals:inv_removals(*, item:inv_items(id, description, quantity, unit_cost, serial_number)),
  comments:inv_comments(*, author:profiles!author_id(id, full_name))
`;

const FLIP_COLS = `
  *,
  location:inv_locations(${LOC_COLS}),
  initiator:profiles!initiated_by(id, full_name)
`;

// ── Locations ─────────────────────────────────────────────────────────────

export async function fetchAllLocations(): Promise<InvLocation[]> {
  const { data, error } = await supabase
    .from('inv_locations')
    .select(LOC_COLS)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type MyLocationAssignment = { location: InvLocation; is_owner: boolean };

export async function fetchMyLocations(): Promise<MyLocationAssignment[]> {
  const { data, error } = await supabase
    .from('inv_location_assignments')
    .select(`is_owner, location:inv_locations(${LOC_COLS})`);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((d: any) => d.location)
    .map((d: any) => ({ location: d.location as InvLocation, is_owner: d.is_owner as boolean }))
    .sort((a, b) => a.location.sort_order - b.location.sort_order);
}

// ── Location assignments ──────────────────────────────────────────────────

export type LocationAssignee = { id: string; full_name: string; is_owner: boolean };
export type LocationAssignees = Record<string, LocationAssignee[]>;

export async function fetchAllLocationAssignments(): Promise<LocationAssignees> {
  const { data, error } = await supabase
    .from('inv_location_assignments')
    .select('location_id, is_owner, user:profiles!user_id(id, full_name)');
  if (error) throw new Error(error.message);
  const result: LocationAssignees = {};
  for (const row of data ?? []) {
    const u = (row as any).user as { id: string; full_name: string } | null;
    if (!u) continue;
    const lid = (row as any).location_id as string;
    if (!result[lid]) result[lid] = [];
    result[lid].push({ id: u.id, full_name: u.full_name, is_owner: (row as any).is_owner as boolean });
  }
  return result;
}

export async function fetchLocationOwners(
  locationIds: string[],
): Promise<Record<string, { id: string; full_name: string } | null>> {
  if (locationIds.length === 0) return {};
  const { data, error } = await supabase
    .from('inv_location_assignments')
    .select('location_id, user:profiles!user_id(id, full_name)')
    .in('location_id', locationIds)
    .eq('is_owner', true);
  if (error) throw new Error(error.message);
  const result: Record<string, { id: string; full_name: string } | null> = {};
  for (const row of data ?? []) {
    result[(row as any).location_id] = (row as any).user ?? null;
  }
  return result;
}

export async function setLocationOwner(locationId: string, userId: string): Promise<void> {
  // Clear any existing owner for this location, then set the new one
  const { error: e1 } = await supabase
    .from('inv_location_assignments')
    .update({ is_owner: false })
    .eq('location_id', locationId);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await supabase
    .from('inv_location_assignments')
    .update({ is_owner: true })
    .eq('location_id', locationId)
    .eq('user_id', userId);
  if (e2) throw new Error(e2.message);
}

export async function addLocationAssignment(locationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('inv_location_assignments')
    .insert({ location_id: locationId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function removeLocationAssignment(locationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('inv_location_assignments')
    .delete()
    .eq('location_id', locationId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function fetchSubLocations(locationId: string): Promise<InvSubLocation[]> {
  const { data, error } = await supabase
    .from('inv_sub_locations')
    .select('*')
    .eq('location_id', locationId)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Asset register ────────────────────────────────────────────────────────

export async function fetchActiveItems(locationId: string): Promise<InvItem[]> {
  const { data, error } = await supabase
    .from('inv_items')
    .select('*, sub_location:inv_sub_locations(*)')
    .eq('location_id', locationId)
    .eq('status', 'active')
    .order('description');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchAllActiveItems(): Promise<InvItem[]> {
  const { data, error } = await supabase
    .from('inv_items')
    .select('*, sub_location:inv_sub_locations(*), location:inv_locations(id, name)')
    .eq('status', 'active')
    .order('description');
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Full register (Asset Register tab) ──────────────────────────────────

export interface RegisterItem extends InvItem {
  location: InvLocation;
}

export async function fetchRegisterItems(): Promise<RegisterItem[]> {
  const { data, error } = await supabase
    .from('inv_items')
    .select(`*, sub_location:inv_sub_locations(*), location:inv_locations(${LOC_COLS})`)
    .order('description');
  if (error) throw new Error(error.message);
  return (data ?? []) as RegisterItem[];
}

export type ItemEditPatch = Partial<{
  description: string;
  serial_number: string | null;
  quantity: number;
  unit_cost: number;
  condition: InvItemCondition;
  is_donated: boolean | null;
  sub_location_id: string | null;
  notes: string | null;
  who_has_it: string | null;
  review_flag: string | null;
  filing_status: import('./inventory-types').InvFilingStatus;
  status: import('./inventory-types').InvItemStatus;
  benton_schedule: InvBentonSchedule;
  removed_date: string | null;
  reconciled: boolean;
}>;

export async function patchItem(id: string, patch: ItemEditPatch): Promise<void> {
  const { error } = await supabase.from('inv_items').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Bulk-unchecks every item's "Reconciled" mark — for starting a fresh
 * pass through the register (e.g. next year's spot-check cycle). */
export async function clearAllReconciled(): Promise<void> {
  const { error } = await supabase.rpc('inv_clear_all_reconciled');
  if (error) throw new Error(error.message);
}

// ── Monthly submissions ───────────────────────────────────────────────────

export async function fetchSubmissions(locationId?: string): Promise<InvMonthlySubmission[]> {
  let q = supabase
    .from('inv_monthly_submissions')
    .select(SUB_COLS)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });
  if (locationId) q = q.eq('location_id', locationId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as InvMonthlySubmission[];
}

export async function fetchAllCurrentPeriodSubmissions(
  month: number,
  year: number,
): Promise<InvMonthlySubmission[]> {
  const { data, error } = await supabase
    .from('inv_monthly_submissions')
    .select(SUB_COLS)
    .eq('period_month', month)
    .eq('period_year', year);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as InvMonthlySubmission[];
  return rows.sort((a, b) => (a.location?.sort_order ?? 0) - (b.location?.sort_order ?? 0));
}

export async function fetchSubmission(id: string): Promise<InvMonthlySubmission> {
  const { data, error } = await supabase
    .from('inv_monthly_submissions')
    .select(SUB_DETAIL_COLS)
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as InvMonthlySubmission;
}

export async function fetchOrCreateSubmission(
  locationId: string,
  month: number,
  year: number,
): Promise<InvMonthlySubmission> {
  const { data: existing } = await supabase
    .from('inv_monthly_submissions')
    .select(SUB_DETAIL_COLS)
    .eq('location_id', locationId)
    .eq('period_month', month)
    .eq('period_year', year)
    .maybeSingle();
  if (existing) return existing as InvMonthlySubmission;
  const { data, error } = await supabase
    .from('inv_monthly_submissions')
    .insert({ location_id: locationId, period_month: month, period_year: year })
    .select(SUB_DETAIL_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as InvMonthlySubmission;
}

export async function patchSubmission(
  id: string,
  patch: { nothing_came_in?: boolean; nothing_left?: boolean },
): Promise<void> {
  const { error } = await supabase.from('inv_monthly_submissions').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function submitForReview(id: string): Promise<void> {
  const { error } = await supabase
    .from('inv_monthly_submissions')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function approveSubmission(id: string): Promise<void> {
  const { error } = await supabase.rpc('inv_approve_submission', { p_submission_id: id });
  if (error) throw new Error(error.message);
}

// ── Additions ─────────────────────────────────────────────────────────────

export type NewAddition = {
  description: string;
  serial_number?: string | null;
  is_batch: boolean;
  batch_category?: string | null;
  condition: InvItemCondition;
  is_donated: boolean;
  quantity: number;
  cost: number;
  cost_basis: InvCostBasis;
  cost_source: InvCostSource;
  sub_location_id?: string | null;
  notes?: string | null;
};

export async function addAddition(submissionId: string, entry: NewAddition): Promise<InvAddition> {
  const { data, error } = await supabase
    .from('inv_additions')
    .insert({ ...entry, submission_id: submissionId })
    .select('*, sub_location:inv_sub_locations(*)')
    .single();
  if (error) throw new Error(error.message);
  return data as InvAddition;
}

export async function updateAddition(id: string, patch: Partial<NewAddition>): Promise<void> {
  const { error } = await supabase.from('inv_additions').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteAddition(id: string): Promise<void> {
  const { error } = await supabase.from('inv_additions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Removals ──────────────────────────────────────────────────────────────

export type NewRemoval = {
  inv_item_id?: string | null;
  description: string;
  serial_number?: string | null;
  quantity_removed: number;
  how_it_left: InvExitMethod;
  notes?: string | null;
};

export async function addRemoval(submissionId: string, entry: NewRemoval): Promise<InvRemoval> {
  const { data, error } = await supabase
    .from('inv_removals')
    .insert({ ...entry, submission_id: submissionId })
    .select('*, item:inv_items(id, description, quantity, unit_cost, serial_number)')
    .single();
  if (error) throw new Error(error.message);
  return data as InvRemoval;
}

export async function updateRemoval(id: string, patch: Partial<NewRemoval>): Promise<void> {
  const { error } = await supabase.from('inv_removals').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteRemoval(id: string): Promise<void> {
  const { error } = await supabase.from('inv_removals').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Comments ──────────────────────────────────────────────────────────────

export async function addComment(
  submissionId: string,
  body: string,
  additionId?: string,
  removalId?: string,
): Promise<InvComment> {
  const { data, error } = await supabase
    .from('inv_comments')
    .insert({
      submission_id: submissionId,
      body,
      addition_id: additionId ?? null,
      removal_id: removalId ?? null,
    })
    .select('*, author:profiles!author_id(id, full_name)')
    .single();
  if (error) throw new Error(error.message);
  return data as InvComment;
}

// ── Filings ───────────────────────────────────────────────────────────────

export async function fetchLastFilingYear(): Promise<number | null> {
  const { data } = await supabase
    .from('inv_filings')
    .select('year')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.year ?? null;
}

export async function recordFiling(year: number, notes?: string): Promise<void> {
  const { error } = await supabase
    .from('inv_filings')
    .upsert({ year, notes: notes ?? null, filed_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// ── Filing view data ──────────────────────────────────────────────────────

export interface FilingItem extends Omit<InvItem, 'sub_location'> {
  location: InvLocation;
  sub_location: InvSubLocation | null;
}

export async function fetchFilingData(): Promise<{
  activeItems: FilingItem[];
  removedSinceLastFiling: FilingItem[];
  lastFiling: { year: number; filed_at: string } | null;
}> {
  const [itemsRes, filingRes] = await Promise.all([
    supabase
      .from('inv_items')
      .select('*, location:inv_locations(id, name, sort_order), sub_location:inv_sub_locations(id, name)')
      .order('benton_schedule')
      .order('description'),
    supabase
      .from('inv_filings')
      .select('year, filed_at')
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);

  const lastFiling = filingRes.data ?? null;
  const cutoffDate = lastFiling?.filed_at.slice(0, 10) ?? '2020-01-01';
  const all = (itemsRes.data ?? []) as FilingItem[];

  return {
    activeItems:            all.filter(i => i.status === 'active'),
    removedSinceLastFiling: all.filter(
      i => i.status === 'removed' && !!i.removed_date && i.removed_date > cutoffDate,
    ),
    lastFiling,
  };
}

export async function markFiled(year: number): Promise<number> {
  const { data, error } = await supabase.rpc('inv_mark_filed', { p_year: year });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export async function patchItemFiling(
  id: string,
  patch: { benton_schedule?: InvBentonSchedule; filed_as?: string | null; who_has_it?: string | null },
): Promise<void> {
  const { error } = await supabase.from('inv_items').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Consumables (Schedule 2 annual estimates) ─────────────────────────────

export async function fetchConsumablesSnapshot(year: number): Promise<InvConsumablesSnapshot[]> {
  const { data, error } = await supabase
    .from('inv_consumables_snapshots')
    .select('*')
    .eq('year', year)
    .order('category');
  if (error) throw new Error(error.message);
  return (data ?? []) as InvConsumablesSnapshot[];
}

export async function upsertConsumablesSnapshot(
  year: number,
  category: string,
  amount: number,
  notes: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('inv_consumables_snapshots')
    .upsert(
      { year, category, amount, notes, updated_at: new Date().toISOString() },
      { onConflict: 'year,category' },
    );
  if (error) throw new Error(error.message);
}

// ── Batch tallies ─────────────────────────────────────────────────────────

export async function fetchBatchTallies(year: number): Promise<InvBatchTally[]> {
  const { data, error } = await supabase
    .from('inv_batch_tallies')
    .select('*, location:inv_locations(id, name, sort_order)')
    .eq('year', year)
    .order('location_id')
    .order('category');
  if (error) throw new Error(error.message);
  return (data ?? []) as InvBatchTally[];
}

export async function upsertBatchTally(
  year: number,
  locationId: string,
  category: string,
  patch: { filed_value?: number | null; decision?: 'keep' | 'update' | 'assess' | null; notes?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('inv_batch_tallies')
    .upsert(
      { year, location_id: locationId, category, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'location_id,category,year' },
    );
  if (error) throw new Error(error.message);
}

// Computes how much was added to each batch category per location this year,
// from approved monthly submissions. Returns location_id -> category -> total value.
export async function fetchBatchActivity(
  year: number,
): Promise<Record<string, Record<string, number>>> {
  const { data, error } = await supabase
    .from('inv_monthly_submissions')
    .select('location_id, additions:inv_additions(is_batch, batch_category, cost, cost_basis, quantity)')
    .eq('period_year', year)
    .eq('status', 'approved');
  if (error) throw new Error(error.message);
  const result: Record<string, Record<string, number>> = {};
  for (const sub of (data ?? []) as any[]) {
    const locId = sub.location_id as string;
    if (!result[locId]) result[locId] = {};
    for (const add of (sub.additions ?? []) as any[]) {
      if (!add.is_batch || !add.batch_category) continue;
      const value = add.cost_basis === 'per_item' ? add.cost * add.quantity : add.cost;
      result[locId][add.batch_category] = (result[locId][add.batch_category] ?? 0) + value;
    }
  }
  return result;
}

// Computes current register value for each batch category per location,
// from active inv_items rows. Returns location_id -> category -> total value.
export async function fetchBatchRegisterValues(): Promise<Record<string, Record<string, number>>> {
  const { data, error } = await supabase
    .from('inv_items')
    .select('location_id, batch_category, unit_cost, quantity')
    .eq('is_batch', true)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  const result: Record<string, Record<string, number>> = {};
  for (const item of (data ?? []) as any[]) {
    if (!item.batch_category) continue;
    if (!result[item.location_id]) result[item.location_id] = {};
    result[item.location_id][item.batch_category] =
      (result[item.location_id][item.batch_category] ?? 0) + item.unit_cost * item.quantity;
  }
  return result;
}

// ── House Flip ────────────────────────────────────────────────────────────

export async function fetchActiveFlipForLocation(locationId: string): Promise<InvHouseFlip | null> {
  const { data, error } = await supabase
    .from('inv_house_flips')
    .select(FLIP_COLS)
    .eq('location_id', locationId)
    .neq('status', 'submitted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as InvHouseFlip | null;
}

export async function fetchAllActiveFlips(): Promise<InvHouseFlip[]> {
  const { data, error } = await supabase
    .from('inv_house_flips')
    .select(FLIP_COLS)
    .neq('status', 'submitted')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InvHouseFlip[];
}

export async function fetchRecentFlips(limit = 10): Promise<InvHouseFlip[]> {
  const { data, error } = await supabase
    .from('inv_house_flips')
    .select(FLIP_COLS)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as InvHouseFlip[];
}

export async function startHouseFlip(locationId: string): Promise<InvHouseFlip> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: flip, error: flipErr } = await supabase
    .from('inv_house_flips')
    .insert({ location_id: locationId, initiated_by: user.id })
    .select(FLIP_COLS)
    .single();
  if (flipErr) throw new Error(flipErr.message);

  // Populate item checks from active register items for this house
  const { data: items, error: itemErr } = await supabase
    .from('inv_items')
    .select('id')
    .eq('location_id', locationId)
    .eq('status', 'active');
  if (itemErr) throw new Error(itemErr.message);

  if (items && items.length > 0) {
    const checks = items.map((item) => ({ flip_id: flip.id, item_id: item.id }));
    const { error: checkErr } = await supabase.from('inv_flip_item_checks').insert(checks);
    if (checkErr) throw new Error(checkErr.message);
  }

  return flip as InvHouseFlip;
}

export async function fetchFlipItemChecks(flipId: string): Promise<InvFlipItemCheck[]> {
  const { data, error } = await supabase
    .from('inv_flip_item_checks')
    .select('*, item:inv_items(*, sub_location:inv_sub_locations(*))')
    .eq('flip_id', flipId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as InvFlipItemCheck[];
}

export async function setItemChecked(checkId: string, checked: boolean): Promise<void> {
  const { error } = await supabase
    .from('inv_flip_item_checks')
    .update({ checked_present: checked })
    .eq('id', checkId);
  if (error) throw new Error(error.message);
}

export async function confirmMissingAndAdvance(
  flipId: string,
  confirmedMissingCheckIds: string[],
): Promise<void> {
  // Set confirmed_missing for the confirmed ones
  if (confirmedMissingCheckIds.length > 0) {
    const { error } = await supabase
      .from('inv_flip_item_checks')
      .update({ confirmed_missing: true })
      .in('id', confirmedMissingCheckIds);
    if (error) throw new Error(error.message);
  }
  // Advance flip to leave_behinds
  const { error } = await supabase
    .from('inv_house_flips')
    .update({ status: 'leave_behinds' })
    .eq('id', flipId);
  if (error) throw new Error(error.message);
}

export async function fetchFlipLeaveBehinds(flipId: string): Promise<InvFlipLeaveBehind[]> {
  const { data, error } = await supabase
    .from('inv_flip_leave_behinds')
    .select('*, sub_location:inv_sub_locations(*)')
    .eq('flip_id', flipId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as InvFlipLeaveBehind[];
}

export async function addLeaveBehind(
  flipId: string,
  entry: {
    description: string;
    condition: string;
    estimated_value: number | null;
    sub_location_id: string | null;
    keeping: boolean;
    notes: string | null;
  },
): Promise<InvFlipLeaveBehind> {
  const { data, error } = await supabase
    .from('inv_flip_leave_behinds')
    .insert({ flip_id: flipId, ...entry })
    .select('*, sub_location:inv_sub_locations(*)')
    .single();
  if (error) throw new Error(error.message);
  return data as InvFlipLeaveBehind;
}

export async function deleteLeaveBehind(id: string): Promise<void> {
  const { error } = await supabase.from('inv_flip_leave_behinds').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function advanceFlipStatus(flipId: string, newStatus: InvFlipStatus): Promise<void> {
  const { error } = await supabase
    .from('inv_house_flips')
    .update({ status: newStatus })
    .eq('id', flipId);
  if (error) throw new Error(error.message);
}

export async function approveFlipForPurchasing(flipId: string, notes: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('inv_house_flips')
    .update({
      status:             'purchasing',
      shelly_approved_by: user.id,
      shelly_approved_at: new Date().toISOString(),
      shelly_notes:       notes || null,
    })
    .eq('id', flipId);
  if (error) throw new Error(error.message);
}

export async function fetchFlipNewItems(flipId: string): Promise<InvFlipNewItem[]> {
  const { data, error } = await supabase
    .from('inv_flip_new_items')
    .select('*, sub_location:inv_sub_locations(*)')
    .eq('flip_id', flipId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as InvFlipNewItem[];
}

export async function addFlipNewItem(
  flipId: string,
  entry: {
    description: string;
    serial_number: string | null;
    is_batch: boolean;
    batch_category: string | null;
    condition: string;
    is_donated: boolean;
    quantity: number;
    cost: number;
    cost_basis: string;
    cost_source: string;
    sub_location_id: string | null;
    notes: string | null;
  },
): Promise<InvFlipNewItem> {
  const { data, error } = await supabase
    .from('inv_flip_new_items')
    .insert({ flip_id: flipId, ...entry })
    .select('*, sub_location:inv_sub_locations(*)')
    .single();
  if (error) throw new Error(error.message);
  return data as InvFlipNewItem;
}

export async function deleteFlipNewItem(id: string): Promise<void> {
  const { error } = await supabase.from('inv_flip_new_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function submitHouseFlip(flipId: string): Promise<void> {
  const { error } = await supabase.rpc('inv_submit_house_flip', { p_flip_id: flipId });
  if (error) throw new Error(error.message);
}
