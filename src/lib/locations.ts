import { supabase } from './supabase';

// Organization addresses and where people go for a program (migration 0224).
//
// Every organization keeps one list of labeled addresses ("Corvallis Office", "Food pantry"),
// shared by Partnerships (the Directory record) and Resident Services. A private location (a
// shelter) stores the city only -- the database refuses a street on one.
//
// A program's location is any of its organization's addresses, Remote, or Unknown. The
// Resident Services "Where" filter is worked out from those addresses' cities (below):
// it answers "is this somewhere the person can get to?", not "who does it serve?".

export interface OrgAddress {
  id: string;
  partner_id: string;
  label: string;
  street: string | null;
  city: string | null;
  is_private: boolean;
}

/** Where the "Where" filter puts a city. Keep in sync with the website's copy
 *  (sparrow-website resources-in-our-area.astro). Add towns here as they come up. */
export const CITY_COUNTY: Record<string, 'Benton County' | 'Linn County' | 'Lincoln County'> = {
  corvallis: 'Benton County',
  philomath: 'Benton County',
  'adair village': 'Benton County',
  monroe: 'Benton County',
  albany: 'Linn County',
  lebanon: 'Linn County',
  'sweet home': 'Linn County',
  brownsville: 'Linn County',
  harrisburg: 'Linn County',
  newport: 'Lincoln County',
  'lincoln city': 'Lincoln County',
  toledo: 'Lincoln County',
  waldport: 'Lincoln County',
};

/** The towns with their own filter button. */
export const TOWNS = ['Corvallis', 'Philomath'] as const;

/** The "Where" filter buttons, in order. */
export const WHERE_OPTIONS = ['Corvallis', 'Philomath', 'Benton County', 'Linn County', 'Lincoln County', 'Farther away', 'Remote'] as const;

/** The county (or "Farther away") a city is in. Null when there's no city. */
export function cityArea(city: string | null | undefined): string | null {
  const c = (city ?? '').trim().toLowerCase();
  if (!c) return null;
  return CITY_COUNTY[c] ?? 'Farther away';
}

/** "Corvallis Office — 257 SW Madison Ave, Corvallis"; a private one shows its city only. */
export function addressLine(a: Pick<OrgAddress, 'street' | 'city' | 'is_private'>): string {
  if (a.is_private) return `${a.city ?? ''} · private location`.trim();
  return [a.street, a.city].filter(Boolean).join(', ');
}

/** `available` is false until migration 0224 runs. */
export async function fetchOrgAddresses(partnerId: string): Promise<{ addresses: OrgAddress[]; available: boolean }> {
  const { data, error } = await supabase
    .from('organization_addresses')
    .select('id, partner_id, label, street, city, is_private')
    .eq('partner_id', partnerId)
    .order('created_at');
  if (error) return { addresses: [], available: false };
  return { addresses: (data ?? []) as OrgAddress[], available: true };
}

/** Every organization's addresses (for the Directory table). Null before 0224 runs. */
export async function fetchAllOrgAddresses(): Promise<OrgAddress[] | null> {
  const { data, error } = await supabase
    .from('organization_addresses')
    .select('id, partner_id, label, street, city, is_private')
    .order('created_at');
  if (error) return null;
  return (data ?? []) as OrgAddress[];
}

export interface AddressInput { label: string; street: string; city: string; is_private: boolean }

/** Goes through a database function so Resident Services can add an address to an
 *  organization it has only just added or connected. */
export async function addOrgAddress(partnerId: string, input: AddressInput): Promise<OrgAddress> {
  const { data, error } = await supabase.rpc('add_organization_address', {
    p_partner_id: partnerId, p_label: input.label, p_street: input.is_private ? null : input.street,
    p_city: input.city, p_private: input.is_private,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as OrgAddress | undefined;
  if (!row) throw new Error('Could not add the address.');
  return row;
}

export async function updateOrgAddress(id: string, input: AddressInput): Promise<void> {
  const { error } = await supabase
    .from('organization_addresses')
    .update({
      label: input.label.trim(),
      street: input.is_private ? null : (input.street.trim() || null),
      city: input.city.trim() || null,
      is_private: input.is_private,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteOrgAddress(id: string): Promise<void> {
  const { error } = await supabase.from('organization_addresses').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** A program's location: its ticked addresses, Remote, or Unknown (which stands alone). */
export interface ProgramLocation { addressIds: string[]; remote: boolean; unknown: boolean }

export async function setProgramLocation(serviceId: string, loc: ProgramLocation): Promise<void> {
  const unknown = loc.unknown;
  const { error: e1 } = await supabase
    .from('resident_services')
    .update({ location_remote: unknown ? false : loc.remote, location_unknown: unknown })
    .eq('id', serviceId);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await supabase.from('resident_service_locations').delete().eq('service_id', serviceId);
  if (e2) throw new Error(e2.message);
  const ids = unknown ? [] : loc.addressIds;
  if (ids.length > 0) {
    const { error: e3 } = await supabase
      .from('resident_service_locations')
      .insert(ids.map((address_id) => ({ service_id: serviceId, address_id })));
    if (e3) throw new Error(e3.message);
  }
}

/** Split "123 Main St, Corvallis, OR 97333" for the Add form (Partnerships' old one-line field). */
export function splitAddress(text: string): { street: string; city: string } {
  let t = text.replace(/\s*\n\s*/g, ', ').trim();
  t = t.replace(/,?\s*\b(OR|Oregon)\b\.?\s*(\d{5}(-\d{4})?)?\s*$/i, '').replace(/,?\s*\d{5}(-\d{4})?\s*$/, '');
  t = t.replace(/^[\s,]+|[\s,]+$/g, '');
  if (!t) return { street: '', city: '' };
  const parts = t.split(/\s*,\s*/);
  if (parts.length === 1) return /\d/.test(t) ? { street: t, city: '' } : { street: '', city: t };
  const city = parts[parts.length - 1];
  if (/\d/.test(city)) return { street: t, city: '' };
  return { street: parts.slice(0, -1).join(', '), city };
}
