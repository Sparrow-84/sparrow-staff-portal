import { supabase } from './supabase';

export interface NotepadLabel {
  id: string;
  name: string;
  color: string; // matches a LABEL_COLORS id
  created_by: string;
  created_at: string;
}

export interface NotepadEntry {
  id: string;
  created_by: string;
  title: string;
  body: string;
  label_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Entries ───────────────────────────────────────────────────────────

export async function fetchNotepadEntries(userId: string): Promise<NotepadEntry[]> {
  const { data, error } = await supabase
    .from('notepad_entries')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) return []; // table may not exist until 0167 is applied
  return (data ?? []) as NotepadEntry[];
}

export async function createNotepadEntry(
  userId: string,
  title: string,
  body: string,
  labelId: string | null,
): Promise<NotepadEntry> {
  const { data, error } = await supabase
    .from('notepad_entries')
    .insert({ created_by: userId, title, body, label_id: labelId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as NotepadEntry;
}

export async function updateNotepadEntry(
  id: string,
  patch: { title?: string; body?: string; label_id?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('notepad_entries')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteNotepadEntry(id: string): Promise<void> {
  const { error } = await supabase.from('notepad_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Labels ────────────────────────────────────────────────────────────

export async function fetchNotepadLabels(userId: string): Promise<NotepadLabel[]> {
  const { data, error } = await supabase
    .from('notepad_labels')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as NotepadLabel[];
}

export async function createNotepadLabel(userId: string, name: string, color: string): Promise<NotepadLabel> {
  const { data, error } = await supabase
    .from('notepad_labels')
    .insert({ created_by: userId, name, color })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as NotepadLabel;
}

export async function updateNotepadLabel(id: string, patch: { name?: string; color?: string }): Promise<void> {
  const { error } = await supabase.from('notepad_labels').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteNotepadLabel(id: string): Promise<void> {
  const { error } = await supabase.from('notepad_labels').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
