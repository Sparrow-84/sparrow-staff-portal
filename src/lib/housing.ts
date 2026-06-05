import { supabase } from './supabase';
import type {
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

// ── Reads (RLS gates resident PII to TOC staff + admins) ─────────────
export async function fetchSpaces(): Promise<Space[]> {
  const { data, error } = await supabase.from('spaces').select('*');
  if (error) throw new Error(error.message);
  const spaces = (data ?? []) as Space[];
  // Lot labels are numeric strings; sort numerically for the grid.
  return spaces.sort((a, b) => Number(a.label) - Number(b.label));
}

export async function fetchTenants(): Promise<Tenant[]> {
  const { data, error } = await supabase.from('tenants').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as Tenant[];
}

export async function fetchWorkOrders(): Promise<WorkOrderWithAssignee[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select(WO_SELECT)
    .order('request_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as WorkOrderWithAssignee[];
}

// ── Writes (RLS: can_see_residents only) ─────────────────────────────
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

export async function updateSpace(
  id: string,
  patch: Partial<Pick<Space, 'status' | 'type' | 'current_rent' | 'rent_status' | 'size' | 'notes'>>,
): Promise<void> {
  const { error } = await supabase.from('spaces').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Residents (RLS: can_see_residents only — TOC staff + admins) ─────
export interface TenantInput {
  space_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  household_size: number;
  annual_income: number | null;
  status: TenantStatus;
  move_in_date: string | null;
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
