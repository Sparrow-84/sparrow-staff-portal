import { supabase } from './supabase';
import type { AppRole, Department, LcpRole, Profile } from './types';

export interface StaffInput {
  full_name: string;
  email: string;
  role: AppRole;
  department: Department;
  manager_email: string | null;
  lcp_role: LcpRole;
  partnerships_access: boolean;
  ops_access: boolean;
  toc_access: boolean;
  role_description?: string | null;
}

/** All staff including deactivated (admin view). RLS still restricts this to admins in practice. */
export async function fetchAllStaff(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

export async function createStaff(input: StaffInput): Promise<void> {
  const { error } = await supabase.from('profiles').insert({
    ...input,
    email: input.email.trim().toLowerCase(),
    active: true,
  });
  if (error) throw new Error(error.message);
}

export async function updateStaff(
  id: string,
  patch: Partial<StaffInput> & { active?: boolean },
): Promise<void> {
  const next = { ...patch };
  if (next.email) next.email = next.email.trim().toLowerCase();
  const { error } = await supabase.from('profiles').update(next).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteStaff(id: string): Promise<void> {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export type { AppRole, Department };
