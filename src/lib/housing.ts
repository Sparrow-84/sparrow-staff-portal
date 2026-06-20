import { supabase } from './supabase';
import type {
  HouseholdMember,
  LotNotice,
  NoticeDelivery,
  NoticeType,
  Pet,
  PetType,
  Space,
  Tenant,
  TenantStatus,
  WoCategory,
  WoPriority,
  WoStatus,
  WorkOrder,
} from './housing-types';

export interface WorkOrderWithAssignee extends WorkOrder {
  assignee: { id: string; full_name: string } | null;
}

export interface WorkOrderInput {
  space_id: string | null;
  location: string;
  category: WoCategory;
  description: string;
  priority: WoPriority;
  status: WoStatus;
  assigned_to: string | null;
}

const WO_SELECT = '*, assignee:profiles!work_orders_assigned_to_fkey(id,full_name)';

// ── Spaces ────────────────────────────────────────────────────────────
export async function fetchSpaces(): Promise<Space[]> {
  const { data, error } = await supabase.from('spaces').select('*');
  if (error) throw new Error(error.message);
  const spaces = (data ?? []) as Space[];
  return spaces.sort((a, b) => Number(a.label) - Number(b.label));
}

export async function updateSpace(
  id: string,
  patch: Partial<Pick<Space,
    | 'status' | 'type' | 'ownership' | 'designation_type' | 'designation_label'
    | 'affordable_housing_discount' | 'vin' | 'hud_label' | 'title_holder'
    | 'current_rent' | 'size' | 'street_number' | 'street_name' | 'notes'
  >>,
): Promise<void> {
  const { error } = await supabase.from('spaces').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Tenants ───────────────────────────────────────────────────────────
export async function fetchTenants(): Promise<Tenant[]> {
  const { data, error } = await supabase.from('tenants').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as Tenant[];
}

export interface TenantInput {
  space_id: string | null;
  name: string;
  household_size: number;
  status: TenantStatus;
  move_in_date: string | null;
  children: number;
  children_names: string | null;
  emergency_contact_notes: string | null;
  notes: string | null;
}

export async function createTenant(input: TenantInput): Promise<void> {
  const { error } = await supabase.from('tenants').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateTenant(id: string, patch: Partial<TenantInput>): Promise<void> {
  const { error } = await supabase.from('tenants').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTenant(id: string): Promise<void> {
  const { error } = await supabase.from('tenants').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Move-out / eviction workflow.
 * Archives the tenant (status → moved_out or evicted), marks space vacant.
 * Does NOT delete any records — history is preserved.
 */
export async function moveOutTenant(
  tenantId: string,
  spaceId: string,
  reason: 'moved_out' | 'evicted',
): Promise<void> {
  const { error: tenantErr } = await supabase
    .from('tenants')
    .update({ status: reason })   // keep space_id so archive can show which lot they were at
    .eq('id', tenantId);
  if (tenantErr) throw new Error(tenantErr.message);

  const { error: spaceErr } = await supabase
    .from('spaces')
    .update({ status: 'vacant' })
    .eq('id', spaceId);
  if (spaceErr) throw new Error(spaceErr.message);

  // Archive household members (migration 0026). Falls back to delete if column not yet created.
  const { error: archiveErr } = await supabase
    .from('household_members')
    .update({ is_archived: true, space_id: null })
    .eq('space_id', spaceId);
  if (archiveErr) {
    const { error: delErr } = await supabase.from('household_members').delete().eq('space_id', spaceId);
    if (delErr) throw new Error(delErr.message);
  }
}

// ── Household members ─────────────────────────────────────────────────
export async function fetchHouseholdMembers(spaceId: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('*')
    .eq('space_id', spaceId)
    .order('sort_order');
  if (error) throw new Error(error.message);
  const all = (data ?? []) as HouseholdMember[];
  return all.filter((m) => !m.is_archived);
}

export async function fetchMembersForTenant(tenantId: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as HouseholdMember[];
}

export async function archiveMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('household_members')
    .update({ is_archived: true, space_id: null })
    .eq('id', memberId);
  if (error) throw new Error(error.message);
}

export async function updateMemberTenantLinks(spaceId: string, tenantId: string): Promise<void> {
  const { error } = await supabase
    .from('household_members')
    .update({ tenant_id: tenantId })
    .eq('space_id', spaceId)
    .is('tenant_id', null);
  if (error) throw new Error(error.message);
}

export async function fetchOptedInCount(): Promise<number> {
  const { count, error } = await supabase
    .from('household_members')
    .select('id', { count: 'exact', head: true })
    .eq('park_chat_opt_in', true)
    .not('phone', 'is', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export interface MemberDraft {
  id?: string;
  tenant_id?: string | null;
  name: string;
  phone: string;
  email: string;
  park_chat_opt_in: boolean;
}

export async function syncHouseholdMembers(
  spaceId: string,
  drafts: MemberDraft[],
  originals: HouseholdMember[],
): Promise<void> {
  const draftIds = new Set(drafts.filter((d) => d.id).map((d) => d.id!));

  for (const orig of originals) {
    if (!draftIds.has(orig.id)) {
      const { error } = await supabase.from('household_members').delete().eq('id', orig.id);
      if (error) throw new Error(error.message);
    }
  }

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    if (!d.name.trim()) continue;
    const row = {
      id: d.id ?? crypto.randomUUID(),
      space_id: spaceId,
      name: d.name.trim(),
      phone: d.phone.trim() || null,
      email: d.email.trim() || null,
      park_chat_opt_in: d.park_chat_opt_in,
      sort_order: i,
    };
    const { error } = await supabase.from('household_members').upsert(row);
    if (error) throw new Error(error.message);
  }
}

// ── Pets ──────────────────────────────────────────────────────────────
export async function fetchPets(spaceId: string): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('space_id', spaceId)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as Pet[];
}

export interface PetDraft {
  id?: string;
  pet_type: PetType;
  name: string;
  notes: string;
}

export async function syncPets(
  spaceId: string,
  drafts: PetDraft[],
  originals: Pet[],
): Promise<void> {
  const draftIds = new Set(drafts.filter((d) => d.id).map((d) => d.id!));

  for (const orig of originals) {
    if (!draftIds.has(orig.id)) {
      const { error } = await supabase.from('pets').delete().eq('id', orig.id);
      if (error) throw new Error(error.message);
    }
  }

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const row = {
      id: d.id ?? crypto.randomUUID(),
      space_id: spaceId,
      pet_type: d.pet_type,
      name: d.name.trim() || null,
      notes: d.notes.trim() || null,
      sort_order: i,
    };
    const { error } = await supabase.from('pets').upsert(row);
    if (error) throw new Error(error.message);
  }
}

// ── Lot notices ───────────────────────────────────────────────────────
export interface LotNoticeWithCreator extends LotNotice {
  creator: { id: string; full_name: string } | null;
}

export async function fetchNoticesForTenant(tenantId: string): Promise<LotNoticeWithCreator[]> {
  const { data, error } = await supabase
    .from('lot_notices')
    .select('*, creator:profiles!lot_notices_created_by_fkey(id,full_name)')
    .eq('tenant_id', tenantId)
    .order('notice_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LotNoticeWithCreator[];
}

export async function fetchNoticesForSpace(spaceId: string): Promise<LotNoticeWithCreator[]> {
  const { data, error } = await supabase
    .from('lot_notices')
    .select('*, creator:profiles!lot_notices_created_by_fkey(id,full_name)')
    .eq('space_id', spaceId)
    .order('notice_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LotNoticeWithCreator[];
}

export async function fetchAllNotices(): Promise<LotNoticeWithCreator[]> {
  const { data, error } = await supabase
    .from('lot_notices')
    .select('*, creator:profiles!lot_notices_created_by_fkey(id,full_name)')
    .order('notice_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LotNoticeWithCreator[];
}

export interface LotNoticeInput {
  space_id: string;
  tenant_id: string | null;
  notice_type: NoticeType;
  notice_date: string;
  description: string;
  delivery_method: NoticeDelivery;
  delivery_notes: string | null;
  created_by: string;
}

export async function createNotice(input: LotNoticeInput): Promise<void> {
  const { error } = await supabase.from('lot_notices').insert(input);
  if (error) throw new Error(error.message);
}

export async function deleteNotice(id: string): Promise<void> {
  const { error } = await supabase.from('lot_notices').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Work orders ───────────────────────────────────────────────────────
export async function fetchWorkOrders(): Promise<WorkOrderWithAssignee[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select(WO_SELECT)
    .order('request_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as WorkOrderWithAssignee[];
}

export async function createWorkOrder(input: WorkOrderInput): Promise<void> {
  const { error } = await supabase.from('work_orders').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateWorkOrder(id: string, patch: Partial<WorkOrderInput>): Promise<void> {
  const { error } = await supabase.from('work_orders').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteWorkOrder(id: string): Promise<void> {
  const { error } = await supabase.from('work_orders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
