import { supabase } from './supabase';

// Several people per Directory organization (migration 0200). The starred primary is
// mirrored onto partners.contact_name / partners.role by a DB trigger, so the Directory's
// Contact Person column keeps showing it.

export interface PartnerContact {
  id: string;
  partner_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_primary: boolean;
  created_at: string;
}

export type PartnerContactInput = Pick<PartnerContact, 'name' | 'role' | 'phone' | 'email' | 'notes'>;

/** `available` is false until migration 0200 runs. */
export async function fetchPartnerContacts(partnerId: string): Promise<{ contacts: PartnerContact[]; available: boolean }> {
  const { data, error } = await supabase
    .from('partner_contacts')
    .select('*')
    .eq('partner_id', partnerId)
    .order('is_primary', { ascending: false })
    .order('created_at');
  if (error) return { contacts: [], available: false };
  return { contacts: (data ?? []) as PartnerContact[], available: true };
}

export async function addPartnerContact(partnerId: string, input: PartnerContactInput, makePrimary: boolean): Promise<void> {
  if (makePrimary) await clearPrimary(partnerId);
  const { error } = await supabase.from('partner_contacts').insert({ partner_id: partnerId, ...input, is_primary: makePrimary });
  if (error) throw new Error(error.message);
}

export async function updatePartnerContactRow(id: string, input: PartnerContactInput): Promise<void> {
  const { error } = await supabase.from('partner_contacts').update(input).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePartnerContact(id: string): Promise<void> {
  const { error } = await supabase.from('partner_contacts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

async function clearPrimary(partnerId: string): Promise<void> {
  const { error } = await supabase.from('partner_contacts').update({ is_primary: false }).eq('partner_id', partnerId).eq('is_primary', true);
  if (error) throw new Error(error.message);
}

/** Only one star per organization (a unique index enforces it), so clear the old one first. */
export async function setPrimaryContact(partnerId: string, contactId: string): Promise<void> {
  await clearPrimary(partnerId);
  const { error } = await supabase.from('partner_contacts').update({ is_primary: true }).eq('id', contactId);
  if (error) throw new Error(error.message);
}
