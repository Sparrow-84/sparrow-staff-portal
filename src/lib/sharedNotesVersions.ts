import { supabase } from './supabase';

/**
 * Shared Notes version history (migration 0219). Versions are written only by the
 * database (a trigger on event_shared_notes + restore_shared_note_version), never
 * directly by the app — see the migration header for the rules on when a new
 * version is started vs. the current one updated.
 */

export type SharedNoteVersionKind = 'session' | 'before_big_removal' | 'before_restore' | 'before_delete';

export interface SharedNoteVersion {
  id: string;
  shared_note_id: string;
  event_id: string | null;
  kind: SharedNoteVersionKind;
  notes: string;
  word_count: number;
  editors: string[];
  restored_from: string | null;
  started_at: string;
  ended_at: string;
}

/** Newest first. Returns null if the versions table doesn't exist yet (migration not run). */
export async function fetchSharedNoteVersions(eventId: string): Promise<SharedNoteVersion[] | null> {
  const { data, error } = await supabase
    .from('event_shared_notes_versions')
    .select('id, shared_note_id, event_id, kind, notes, word_count, editors, restored_from, started_at, ended_at')
    .eq('event_id', eventId)
    .order('ended_at', { ascending: false });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return null;
    throw new Error(error.message);
  }
  return (data ?? []) as SharedNoteVersion[];
}

export async function fetchProfileNames(ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return {};
  const { data } = await supabase.from('profiles').select('id, full_name').in('id', unique);
  const out: Record<string, string> = {};
  for (const p of (data ?? []) as { id: string; full_name: string }[]) out[p.id] = p.full_name;
  return out;
}

/** Keeps the current notes as a version, then records the restore. The caller puts the text back in the editor. */
export async function markSharedNoteRestore(versionId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_shared_note_version', { p_version_id: versionId });
  if (error) throw new Error(error.message);
}

// ---------- Comparing two versions ----------

export interface NoteLine {
  text: string;
  kind: 'head' | 'item' | 'para';
}

export interface DiffLine extends NoteLine {
  status: 'same' | 'added' | 'removed';
}

/** Breaks stored rich-text HTML into readable lines (headings, list items, paragraphs). */
export function htmlToLines(html: string): NoteLine[] {
  if (!html.trim()) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines: NoteLine[] = [];
  doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, td, th').forEach((el) => {
    // Paragraphs inside a list item / quote / cell are read as part of that block.
    if (el.tagName === 'P' && el.parentElement?.closest('li, blockquote, td, th')) return;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('ul, ol').forEach((nested) => nested.remove());
    const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const kind: NoteLine['kind'] = /^H[1-6]$/.test(el.tagName) ? 'head' : el.tagName === 'LI' ? 'item' : 'para';
    lines.push({ text, kind });
  });
  // Bare text with no block tags at all.
  if (lines.length === 0) {
    const text = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) lines.push({ text, kind: 'para' });
  }
  return lines;
}

/** Line-by-line comparison: what `after` added to, and removed from, `before`. */
export function diffLines(before: NoteLine[], after: NoteLine[]): DiffLine[] {
  const key = (l: NoteLine) => `${l.kind}|${l.text}`;
  const n = before.length;
  const m = after.length;
  // Longest-common-subsequence table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = key(before[i]) === key(after[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(before[i]) === key(after[j])) {
      out.push({ ...after[j], status: 'same' });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ ...before[i], status: 'removed' });
      i++;
    } else {
      out.push({ ...after[j], status: 'added' });
      j++;
    }
  }
  while (i < n) out.push({ ...before[i++], status: 'removed' });
  while (j < m) out.push({ ...after[j++], status: 'added' });
  return out;
}

function words(lines: NoteLine[]): string[] {
  return lines.flatMap((l) => l.text.toLowerCase().split(/\s+/).filter(Boolean));
}

/** Approximate words added and removed between two versions. */
export function wordChange(before: NoteLine[], after: NoteLine[]): { added: number; removed: number } {
  const counts = new Map<string, number>();
  for (const w of words(before)) counts.set(w, (counts.get(w) ?? 0) + 1);
  let added = 0;
  for (const w of words(after)) {
    const c = counts.get(w) ?? 0;
    if (c > 0) counts.set(w, c - 1);
    else added++;
  }
  let removed = 0;
  for (const c of counts.values()) removed += c;
  return { added, removed };
}
