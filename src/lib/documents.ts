import { supabase } from './supabase';
import type { OrgDocument, RoomSop, SopRoom } from './documents-types';

/**
 * Resource Library docs only (home_room null). Falls back to the unfiltered list
 * if migration 0189 hasn't run yet — before it, every row is a Library doc anyway.
 */
export async function fetchOrgDocuments(): Promise<OrgDocument[]> {
  const base = () =>
    supabase.from('org_documents').select('*').order('category').order('sort_order').order('title');
  const { data, error } = await base().is('home_room', null);
  if (!error) return (data ?? []) as OrgDocument[];
  const fallback = await base();
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []) as OrgDocument[];
}

export async function addOrgDocument(
  input: Pick<OrgDocument, 'title' | 'category' | 'description' | 'url' | 'sort_order'> & { home_room?: SopRoom },
): Promise<void> {
  const { error } = await supabase.from('org_documents').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateOrgDocument(
  id: string,
  patch: Partial<Pick<OrgDocument, 'title' | 'category' | 'description' | 'url' | 'sort_order'>>,
): Promise<void> {
  const { error } = await supabase.from('org_documents').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteOrgDocument(id: string): Promise<void> {
  const { error } = await supabase.from('org_documents').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Room SOPs (migration 0189) ──────────────────────────────────────

/** Rooms a doc is linked into (besides its home). Empty if the links table doesn't exist yet. */
export async function fetchDocLinkedRooms(documentId: string): Promise<SopRoom[]> {
  const { data, error } = await supabase
    .from('org_document_room_links')
    .select('room')
    .eq('document_id', documentId);
  if (error) return [];
  return (data ?? []).map((r) => r.room as SopRoom);
}

/** One room's SOP list: its own docs plus docs linked in from elsewhere. */
export async function fetchRoomSops(room: SopRoom): Promise<RoomSop[]> {
  const [ownRes, linkRes] = await Promise.all([
    supabase.from('org_documents').select('*').eq('home_room', room),
    supabase.from('org_document_room_links').select('document:org_documents(*)').eq('room', room),
  ]);
  if (ownRes.error) throw new Error(ownRes.error.message);
  if (linkRes.error) throw new Error(linkRes.error.message);

  const own = (ownRes.data ?? []) as OrgDocument[];
  const linked = (linkRes.data ?? [])
    .map((r) => (r as unknown as { document: OrgDocument | null }).document)
    .filter((d): d is OrgDocument => d !== null);

  // Where else each of this room's own docs is shown, for the remove warning.
  const outbound = new Map<string, SopRoom[]>();
  if (own.length > 0) {
    const { data } = await supabase
      .from('org_document_room_links')
      .select('document_id, room')
      .in('document_id', own.map((d) => d.id));
    for (const l of data ?? []) {
      const list = outbound.get(l.document_id) ?? [];
      list.push(l.room as SopRoom);
      outbound.set(l.document_id, list);
    }
  }

  return [
    ...own.map((d) => ({ ...d, isOwn: true, linkedRooms: outbound.get(d.id) ?? [] })),
    ...linked.map((d) => ({ ...d, isOwn: false, linkedRooms: [] })),
  ].sort((a, b) => a.title.localeCompare(b.title));
}

/** Docs this user could link into `room`: everything they can see that isn't already there. */
export async function fetchLinkableDocs(room: SopRoom, alreadyShown: string[]): Promise<OrgDocument[]> {
  const { data, error } = await supabase.from('org_documents').select('*').order('title');
  if (error) throw new Error(error.message);
  const shown = new Set(alreadyShown);
  return ((data ?? []) as OrgDocument[]).filter((d) => d.home_room !== room && !shown.has(d.id));
}

export async function linkDocToRoom(documentId: string, room: SopRoom): Promise<void> {
  const { error } = await supabase.from('org_document_room_links').insert({ document_id: documentId, room });
  if (error) throw new Error(error.message);
}

export async function unlinkDocFromRoom(documentId: string, room: SopRoom): Promise<void> {
  const { error } = await supabase
    .from('org_document_room_links')
    .delete()
    .eq('document_id', documentId)
    .eq('room', room);
  if (error) throw new Error(error.message);
}
