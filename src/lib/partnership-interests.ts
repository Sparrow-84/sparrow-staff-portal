import { supabase } from './supabase';

// Shared "Interests" tag library (migration 0109) — mirrors calendar labels (name + color,
// any partnerships staff can create new ones) but a partner can hold many at once, so
// assignment is a separate many-to-many join table rather than a single label_id column.

export interface PartnershipInterest {
  id: string;
  label: string;
  color: string;
  created_at: string;
}

export async function fetchInterests(): Promise<PartnershipInterest[]> {
  const { data, error } = await supabase
    .from('partnership_interests')
    .select('id, label, color, created_at')
    .order('label');
  if (error) throw new Error(error.message);
  return (data ?? []) as PartnershipInterest[];
}

export async function createInterest(label: string, color: string): Promise<PartnershipInterest> {
  const { data, error } = await supabase
    .from('partnership_interests')
    .insert({ label, color })
    .select('id, label, color, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data as PartnershipInterest;
}

/** Every partner's assigned interests, keyed by partner_id — mirrors the donorStatMap pattern. */
export async function fetchPartnerInterestMap(): Promise<Map<string, PartnershipInterest[]>> {
  const { data, error } = await supabase
    .from('partner_interests')
    .select('partner_id, partnership_interests(id, label, color, created_at)');
  if (error) throw new Error(error.message);

  const map = new Map<string, PartnershipInterest[]>();
  for (const row of (data ?? []) as unknown as { partner_id: string; partnership_interests: PartnershipInterest }[]) {
    const list = map.get(row.partner_id) ?? [];
    list.push(row.partnership_interests);
    map.set(row.partner_id, list);
  }
  return map;
}

/** Replaces a partner's full set of interests with the given list. */
export async function setPartnerInterests(partnerId: string, interestIds: string[]): Promise<void> {
  const { error: delErr } = await supabase.from('partner_interests').delete().eq('partner_id', partnerId);
  if (delErr) throw new Error(delErr.message);
  if (interestIds.length === 0) return;
  const { error: insErr } = await supabase
    .from('partner_interests')
    .insert(interestIds.map((interest_id) => ({ partner_id: partnerId, interest_id })));
  if (insErr) throw new Error(insErr.message);
}
