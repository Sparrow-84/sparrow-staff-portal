import { supabase } from './supabase';

export type QuickWinKind =
  | 'lcp_onboarded'
  | 'lcp_phase'
  | 'grant_submitted'
  | 'newsletter'
  | 'procedure'
  | 'custom';

/** Auto-generated celebration feed. Staff never log wins; they may annotate one. */
export interface QuickWin {
  id: string;
  kind: QuickWinKind;
  title: string;
  detail: string | null;
  subject_id: string | null;
  note: string | null;
  created_at: string;
}

export const QUICK_WIN_EMOJI: Record<QuickWinKind, string> = {
  lcp_onboarded: '🏠',
  lcp_phase: '🎓',
  grant_submitted: '📨',
  newsletter: '📰',
  procedure: '✅',
  custom: '🎉',
};

export async function fetchQuickWins(limit = 8): Promise<QuickWin[]> {
  const { data, error } = await supabase
    .from('quick_wins')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as QuickWin[];
}

export async function addQuickWinNote(id: string, note: string): Promise<void> {
  const { error } = await supabase.from('quick_wins').update({ note }).eq('id', id);
  if (error) throw new Error(error.message);
}
