import { supabase } from './supabase';
import type { SharedNoteVersion } from './sharedNotesVersions';

/**
 * Private Prep/Live notes version history (migration 0229). Same rules as Shared
 * Notes (0219), kept per field, and each person can only see their own. Versions are
 * written only by the database, never directly by the app.
 */

export type PrivateNoteField = 'prep' | 'live';

/** Newest first, in the same shape as Shared Notes versions so one screen shows both.
 *  Returns null if the versions table doesn't exist yet (migration not run). */
export async function fetchPrivateNoteVersions(
  eventId: string,
  userId: string,
  field: PrivateNoteField,
): Promise<SharedNoteVersion[] | null> {
  const { data, error } = await supabase
    .from('meeting_notes_versions')
    .select('id, meeting_note_id, event_id, kind, notes, word_count, restored_from, started_at, ended_at')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('field', field)
    .order('ended_at', { ascending: false });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return null;
    throw new Error(error.message);
  }
  return ((data ?? []) as (Omit<SharedNoteVersion, 'shared_note_id' | 'editors'> & { meeting_note_id: string })[]).map(
    ({ meeting_note_id, ...v }) => ({ ...v, shared_note_id: meeting_note_id, editors: [] }),
  );
}

/** Keeps the current text as a version, then records the restore. The caller puts the text back and saves. */
export async function markPrivateNoteRestore(versionId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_meeting_note_version', { p_version_id: versionId });
  if (error) throw new Error(error.message);
}
