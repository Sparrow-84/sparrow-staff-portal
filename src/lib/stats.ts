import { supabase } from './supabase';

// ── Domain types ──────────────────────────────────────────────────────

export interface Stat {
  id: string;
  stat_text: string;
  context: string | null;
  source_publisher: string;
  source_report_name: string;
  source_url: string | null;
  source_date: string | null;
  // False when only the month/year is actually known -- source_date still
  // holds a real date (the 1st of that month) for sorting, this just
  // controls display so a day nobody actually reported never gets shown as
  // if it were. See migration 0188.
  source_date_day_known: boolean;
  // Freeform, ready-to-copy citation text -- separate from the structured
  // source fields above, since a real citation's exact wording/format
  // varies per use (grant narrative vs. social post vs. annual report).
  citation: string | null;
  verified: boolean;
  verified_by: string | null;
  verified_by_name: string | null; // joined from profiles
  verified_at: string | null;
  labels: string[];
  used_in: string | null;
  logged_by: string | null;
  logged_by_name: string | null; // joined from profiles
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatInput {
  stat_text: string;
  context: string | null;
  source_publisher: string;
  source_report_name: string;
  source_url: string | null;
  source_date: string | null;
  source_date_day_known: boolean;
  citation: string | null;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  labels: string[];
  used_in: string | null;
  logged_by: string | null;
  created_by?: string | null;
}

export interface StatLabel {
  id: string;
  name: string;
  color: string; // matches a LABEL_COLORS id
  created_by: string | null;
  created_at: string;
}

// ── Stats ─────────────────────────────────────────────────────────────

const STAT_SELECT =
  '*, logged_by_profile:profiles!stats_logged_by_fkey(full_name), verified_by_profile:profiles!stats_verified_by_fkey(full_name)';

export async function getStats(): Promise<Stat[]> {
  const { data, error } = await supabase
    .from('stats')
    .select(STAT_SELECT)
    .order('created_at', { ascending: false });
  // Table may not exist until 0159 is applied -- degrade to empty rather than
  // throw, same as getStoryTags()/story_tags below. Without this, the whole
  // Stories & Media room (not just the Stats tab) fails to load, since this
  // call sits in the same Promise.all as Stories and Media.
  if (error) return [];
  return ((data ?? []) as unknown[]).map(normalizeStat);
}

export async function createStat(input: StatInput): Promise<void> {
  const { error } = await supabase.from('stats').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateStat(id: string, patch: Partial<StatInput>): Promise<void> {
  const { error } = await supabase
    .from('stats')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteStat(id: string): Promise<void> {
  const { error } = await supabase.from('stats').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Stat labels ───────────────────────────────────────────────────────

export async function getStatLabels(): Promise<StatLabel[]> {
  const { data, error } = await supabase
    .from('stat_labels')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return []; // table may not exist until 0159 is applied
  return (data ?? []) as StatLabel[];
}

export async function createStatLabel(input: { name: string; color: string; created_by: string }): Promise<StatLabel> {
  const { data, error } = await supabase.from('stat_labels').insert(input).select().single();
  if (error) throw new Error(error.message);
  return data as StatLabel;
}

export async function updateStatLabel(id: string, patch: { name?: string; color?: string }): Promise<void> {
  const { error } = await supabase.from('stat_labels').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteStatLabel(id: string): Promise<void> {
  const { error } = await supabase.from('stat_labels').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** "October 2026" when only the month/year is actually known, otherwise the
 *  full "October 3, 2026" -- never invents a day that wasn't really reported. */
export function formatSourceDate(sourceDate: string | null, dayKnown: boolean): string | null {
  if (!sourceDate) return null;
  const [y, m, d] = sourceDate.split('-').map(Number);
  return dayKnown
    ? new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ── Internal helpers ──────────────────────────────────────────────────

function normalizeStat(raw: unknown): Stat {
  const r = raw as Record<string, unknown>;
  const loggerProfile = r['logged_by_profile'] as { full_name?: string } | null;
  const verifierProfile = r['verified_by_profile'] as { full_name?: string } | null;
  return {
    id: r['id'] as string,
    stat_text: r['stat_text'] as string,
    context: (r['context'] as string | null) ?? null,
    source_publisher: r['source_publisher'] as string,
    source_report_name: r['source_report_name'] as string,
    source_url: (r['source_url'] as string | null) ?? null,
    source_date: (r['source_date'] as string | null) ?? null,
    // Defaults true/null until migration 0188 lands -- select('*') just won't
    // return these columns yet, never errors, so this degrades safely.
    source_date_day_known: (r['source_date_day_known'] as boolean | undefined) ?? true,
    citation: (r['citation'] as string | null) ?? null,
    verified: (r['verified'] as boolean) ?? false,
    verified_by: (r['verified_by'] as string | null) ?? null,
    verified_by_name: verifierProfile?.full_name ?? null,
    verified_at: (r['verified_at'] as string | null) ?? null,
    labels: (r['labels'] as string[]) ?? [],
    used_in: (r['used_in'] as string | null) ?? null,
    logged_by: (r['logged_by'] as string | null) ?? null,
    logged_by_name: loggerProfile?.full_name ?? null,
    created_by: (r['created_by'] as string | null) ?? null,
    created_at: r['created_at'] as string,
    updated_at: r['updated_at'] as string,
  };
}
