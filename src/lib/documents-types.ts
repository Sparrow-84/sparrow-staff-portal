// Org-wide reference document library (System 2 — staff portal).
// Every document is a link entry (content lives in Google Drive) with one home:
// home_room null = the Resource Library (all staff read, ops tier manages);
// home_room set  = a room's SOP (that room's staff read, its room admins manage).
// A document can also be linked into other rooms (org_document_room_links, migration 0189).

export type SopRoom = 'twin-oaks' | 'lcp' | 'partnerships' | 'operations' | 'stories';

export interface OrgDocument {
  id: string;
  title: string;
  category: string;
  description: string | null;
  url: string | null;
  sort_order: number;
  created_at: string;
  /** Null until migration 0189 runs, and for Resource Library docs after it. */
  home_room?: SopRoom | null;
}

export const DOCUMENT_CATEGORIES: string[] = [
  'How-Tos & SOPs',
  'Policies & Handbook',
  'Role Guides',
];

/** The two kinds of room SOP — stored in org_documents.category. */
export const SOP_KINDS: string[] = ['How we work', 'Using the portal'];

export const SOP_ROOMS: { value: SopRoom; label: string }[] = [
  { value: 'twin-oaks', label: 'Twin Oaks' },
  { value: 'lcp', label: 'LifeChange' },
  { value: 'partnerships', label: 'Partnerships' },
  { value: 'operations', label: 'Operations' },
  { value: 'stories', label: 'Stories & Media' },
];

export function sopRoomLabel(room: SopRoom | null | undefined): string {
  if (!room) return 'Resource Library';
  return SOP_ROOMS.find((r) => r.value === room)?.label ?? room;
}

/** A doc as shown in one room's SOP list. */
export interface RoomSop extends OrgDocument {
  /** true = lives in this room; false = linked in from elsewhere. */
  isOwn: boolean;
  /** Other rooms this doc is linked into (own docs only — used for the remove warning). */
  linkedRooms: SopRoom[];
}
