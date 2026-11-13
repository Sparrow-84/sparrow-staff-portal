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

// ── Checking the whole list (migration 0226) ───────────────────────────────────────
// The list is checked all together, every 2 years. Green until two weeks before the Next
// check date; amber from then (the room admins get a task); red once the date passes (a
// second, higher-priority task). Before the first "✓ All checked" there's no date at all.

export interface NumbersCheck {
  last_checked_on: string | null;
  last_checked_by: string | null;
  next_check_on: string | null;
}

export type NumbersCheckTone = 'fresh' | 'due' | 'overdue' | 'never';

/** Today as YYYY-MM-DD in local time (dates here are plain calendar dates). */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export function twoYearsFrom(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setFullYear(d.getFullYear() + 2);
  return todayISO(d);
}

export function numbersCheckTone(c: NumbersCheck | null, today: string = todayISO()): NumbersCheckTone {
  if (!c?.next_check_on) return 'never';
  if (today > c.next_check_on) return 'overdue';
  if (today >= addDaysISO(c.next_check_on, -14)) return 'due';
  return 'fresh';
}

/** "November 13, 2026" from a plain YYYY-MM-DD date. */
export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Null until migration 0226 runs (the tab then just doesn't show the check bar). */
export async function fetchNumbersCheck(): Promise<NumbersCheck | null> {
  const { data, error } = await supabase
    .from('resident_numbers_check')
    .select('last_checked_on, last_checked_by, next_check_on')
    .maybeSingle();
  if (error || !data) return null;
  return data as NumbersCheck;
}

/** "✓ All checked": checked today by `userId`, next check on `nextOn`. */
export async function markNumbersChecked(userId: string, nextOn: string): Promise<void> {
  const { error } = await supabase
    .from('resident_numbers_check')
    .update({ last_checked_on: todayISO(), last_checked_by: userId || null, next_check_on: nextOn })
    .eq('id', true);
  if (error) throw new Error(error.message);
}

/** Groups in display order, each with its numbers; empty groups dropped. */
export function groupNumbers(numbers: ResidentNumber[]) {
  return NUMBER_GROUPS
    .map((g) => ({ ...g, rows: numbers.filter((n) => n.group_key === g.key) }))
    .filter((g) => g.rows.length > 0);
}
