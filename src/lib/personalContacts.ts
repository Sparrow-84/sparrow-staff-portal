import { supabase } from './supabase';

export interface PersonalContact {
  id: string;
  created_by: string;
  name: string;
  organization: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  notes: string;
  converted_to_partner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalContactWithOwner extends PersonalContact {
  owner: { full_name: string } | null;
  converted_partner: { name: string } | null;
}

export interface PersonalContactInput {
  name: string;
  organization: string;
  relationship: string;
  phone: string;
  email: string;
  notes: string;
}

export async function fetchMyContacts(userId: string): Promise<PersonalContact[]> {
  const { data, error } = await supabase
    .from('personal_contacts')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) return []; // table may not exist until 0141 is applied
  return (data ?? []) as PersonalContact[];
}

export async function createContact(userId: string, input: PersonalContactInput): Promise<PersonalContact> {
  const { data, error } = await supabase
    .from('personal_contacts')
    .insert({
      created_by: userId,
      name: input.name,
      organization: input.organization,
      relationship: input.relationship,
      phone: input.phone || null,
      email: input.email || null,
      notes: input.notes,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PersonalContact;
}

export async function updateContact(id: string, input: PersonalContactInput): Promise<void> {
  const { error } = await supabase
    .from('personal_contacts')
    .update({
      name: input.name,
      organization: input.organization,
      relationship: input.relationship,
      phone: input.phone || null,
      email: input.email || null,
      notes: input.notes,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('personal_contacts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Partnerships-only aggregated view — RLS allows this only for partnerships_has_access() users. */
export async function fetchAllContacts(): Promise<PersonalContactWithOwner[]> {
  const { data, error } = await supabase
    .from('personal_contacts')
    .select('*, owner:profiles!personal_contacts_created_by_fkey(full_name), converted_partner:partners(name)')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as PersonalContactWithOwner[];
}

/** Marks a contact as transferred into the Directory — via RPC (0142) so partnerships staff
 *  can record this without gaining general write access to someone else's contact entry. */
export async function markContactConverted(contactId: string, partnerId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_personal_contact_converted', {
    p_contact_id: contactId,
    p_partner_id: partnerId,
  });
  if (error) throw new Error(error.message);
}
