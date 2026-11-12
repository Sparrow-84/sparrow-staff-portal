import { supabase } from './supabase';

// Resident Services → "Essential Phone Numbers" tab (migration 0220; "Help lines" group 0224). Phone numbers residents ask
// for that aren't a program you sign up for: police, utilities, city offices, crisis lines.
// Deliberately NOT linked to the Partnerships Directory -- these are never partners.

export const NUMBER_GROUPS = [
  { key: 'emergency', label: 'Emergency and crisis' },
  { key: 'help', label: 'Help lines' },
  { key: 'safety', label: 'Police, fire and safety (not emergencies)' },
  { key: 'offices', label: 'City and county offices' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'other', label: 'Other' },
] as const;
export type NumberGroup = (typeof NUMBER_GROUPS)[number]['key'];

export interface ResidentNumber {
  id: string;
  group_key: NumberGroup;
  name: string;
  phone: string;
  note: string | null;
  /** Printed in the "Other numbers to keep, any time" box at the bottom of every services list. */
  on_services_list: boolean;
  sort_order: number;
  created_at: string;
}

export type NumberInput = Pick<ResidentNumber, 'group_key' | 'name' | 'phone' | 'note' | 'on_services_list'>;

/** `missing` is true until migration 0220 creates the table. */
export async function fetchNumbers(): Promise<{ numbers: ResidentNumber[]; missing: boolean }> {
  const { data, error } = await supabase
    .from('resident_numbers')
    .select('*')
    .order('sort_order')
    .order('name');
  if (error) return { numbers: [], missing: true };
  return { numbers: (data ?? []) as ResidentNumber[], missing: false };
}

export async function createNumber(input: NumberInput): Promise<void> {
  const { error } = await supabase.from('resident_numbers').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateNumber(id: string, patch: Partial<NumberInput>): Promise<void> {
  const { error } = await supabase.from('resident_numbers').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteNumber(id: string): Promise<void> {
  const { error } = await supabase.from('resident_numbers').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** The bottom box of the printed services list, before 0220 runs (what was there already). */
export const FALLBACK_SERVICES_LIST_NUMBERS: Pick<ResidentNumber, 'name' | 'phone' | 'note'>[] = [
  { phone: '911', name: 'Emergency', note: null },
  { phone: '541-754-0110', name: 'Domestic violence, 24-hour crisis line (CARDV)', note: null },
  { phone: '988', name: 'Suicide & crisis line, call or text', note: null },
  { phone: '211', name: 'More local help with housing, food, utilities and more', note: null },
];

/** Groups in display order, each with its numbers; empty groups dropped. */
export function groupNumbers(numbers: ResidentNumber[]) {
  return NUMBER_GROUPS
    .map((g) => ({ ...g, rows: numbers.filter((n) => n.group_key === g.key) }))
    .filter((g) => g.rows.length > 0);
}
